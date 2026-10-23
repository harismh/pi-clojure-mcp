(ns pi-clojure.runtime
  "Health/lifecycle policy only. ClojureMCP owns nREPL evaluation and launching."
  (:require [clojure.data.json :as json]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure-mcp.nrepl :as upstream]
            [clojure-mcp.nrepl-launcher :as launcher]
            [clojure-mcp.tool-system :as tools]
            [nrepl.core :as nrepl])
  (:import [java.net InetAddress InetSocketAddress Socket]))

(def upstream-revision "2b0213f079ab59e3b204c539ead12b63db54e223")
(def state-loss-warning
  "STATE LOSS: this stops the ClojureMCP-owned JVM and discards its application heap, interactive definitions and REPL history. No replay is performed.")

(defn valid-port! [port]
  (when-not (and (integer? port) (<= 1 port 65535))
    (throw (ex-info "Port must be an integer from 1 to 65535" {})))
  port)

(defn valid-host! [host]
  (when-not (contains? #{"localhost" "127.0.0.1" "::1"} host)
    (throw (ex-info "Use a loopback host; tunnel remote nREPL connections over SSH" {})))
  host)

(defn controller [client options]
  {:client client
   :project (.getCanonicalPath (io/file (:project-dir options)))
   :command (or (:clojure-command options) "clojure")
   :state (atom {:evaluations 0 :changing false :generation 0 :detached false})
   :eval-lock (Object.)})

(defn selected-service [{:keys [client project state]}]
  (let [service @client
        port (or (:port service)
                 (when-not (:detached @state) (upstream/read-nrepl-port-file project)))]
    (assoc service :host (valid-host! (or (:host service) "127.0.0.1"))
                   :port (when port (valid-port! port)))))

(defn owned-process [{:keys [client]}]
  (let [process (:nrepl-process @client)]
    (when (and process (.isAlive ^Process process)) process)))

(defn- completed! [responses stage]
  (when-not (some #(some #{"done" :done} (:status %)) responses)
    (throw (ex-info (str "nREPL " stage " timed out or returned no complete response") {:stage stage})))
  responses)

(def runtime-expression
  "{:cwd (System/getProperty \"user.dir\") :pid (str (.pid (java.lang.ProcessHandle/current))) :clojureVersion (clojure-version) :javaVersion (System/getProperty \"java.version\")}")

(defn probe
  "Uses upstream transport/client APIs. No initialization, persistent session,
  application definitions, or changes to the user's *1/*2/*3/*e bindings."
  [service]
  (let [{:keys [host port]} service]
    (valid-host! host)
    (valid-port! port)
    ;; Bound local connect readiness, then use upstream's own connection factory.
    (with-open [socket (Socket.)]
      (.connect socket (InetSocketAddress. host (int port)) 500))
    (let [connection (upstream/open-connection service 1500)]
      (try
        (let [client (:client connection)
              description (-> (nrepl/message client {:op "describe"}) vec
                              (completed! "describe") nrepl/combine-responses)]
          (when-not (contains? (:ops description) :eval)
            (throw (ex-info "Listener did not advertise the nREPL eval operation" {})))
          (merge
           {:ready true :ops (vec (sort (map name (keys (:ops description)))))}
           (try
             (let [responses (-> (nrepl/message client {:op "eval" :code runtime-expression
                                                       :nrepl.middleware.print/quota 8192}) vec
                                 (completed! "metadata"))
                   combined (nrepl/combine-responses responses)]
               (when (:ex combined) (throw (ex-info "Runtime metadata query failed" {})))
               (let [value (edn/read-string (first (:value combined)))]
                 (when-not (and (map? value) (every? string? (map value [:cwd :pid :clojureVersion :javaVersion])))
                   (throw (ex-info "Unexpected runtime metadata shape" {})))
                 (select-keys value [:cwd :pid :clojureVersion :javaVersion])))
             (catch Exception e {:metadataError (ex-message e)}))))
        (finally (upstream/close-connection connection))))))

(defn status [{:keys [_client project state] :as runtime}]
  (let [snapshot @state
        service (selected-service runtime)
        process (owned-process runtime)
        base {:schemaVersion 1 :mcp "connected" :ready false
              :project project :host (:host service) :port (:port service)
              :ownership (cond process "managed" (:port service) "external" :else "none")
              :managedPid (when process (str (.pid ^Process process)))
              :namespace (when (:port service) (upstream/current-ns service :default))
              :namespaceSource "last-evaluation"
              :activeRequests (:evaluations snapshot) :changing (:changing snapshot)
              :generation (:generation snapshot)
              :observedAt (System/currentTimeMillis) :upstreamRevision upstream-revision}
        result (cond
                 (:changing snapshot) (assoc base :reason "Target change in progress")
                 (nil? (:port service)) (assoc base :reason "No selected nREPL. Attach or explicitly start one.")
                 :else (try (merge base (probe service))
                            (catch Exception e (assoc base :reason (ex-message e)))))
        current @state]
    (assoc result :stale (or (:changing current) (not= (:generation snapshot) (:generation current))))))

(defn- begin-change! [{:keys [state]}]
  (loop []
    (let [old @state]
      (when (or (:changing old) (pos? (:evaluations old)))
        (throw (ex-info "An evaluation or target change is active; wait before changing runtime ownership" {})))
      (when-not (compare-and-set! state old (assoc old :changing true)) (recur)))))

(defn- acknowledge! [runtime args]
  (when (and (owned-process runtime) (not (true? (:confirm_state_loss args))))
    (throw (ex-info (str state-loss-warning " Set confirm_state_loss=true only after acknowledging heap loss.") {}))))

(defn managed-command [runtime]
  ;; Direct nREPL startup avoids creating/overwriting a project's .nrepl-port file.
  [(:command runtime) "-Sdeps" "{:deps {nrepl/nrepl {:mvn/version \"1.7.0\"}}}"
   "-M" "-e"
   "(require 'nrepl.server) (let [s (nrepl.server/start-server :bind \"127.0.0.1\" :port 0)] (println \"nREPL server started on port\" (:port s)) (flush) @(promise))"])

(defn- stop-owned! [runtime]
  (when-let [process (owned-process runtime)]
    (launcher/destroy-nrepl-process process)
    (when (.isAlive ^Process process)
      (throw (ex-info "Owned JVM did not terminate; ownership was not cleared" {})))))

(defn change!
  "Only this layer changes the default target. Upstream is the sole JVM launcher."
  [{:keys [client project state] :as runtime} args]
  (let [{:keys [action port host]} args]
    (when-not (contains? #{"start" "attach" "stop"} action)
      (throw (ex-info "Expected start, attach, or stop" {})))
    (when (= action "attach") (valid-port! port) (valid-host! (or host "127.0.0.1")))
    (when (and (not= action "attach") (or port host))
      (throw (ex-info "Only attach accepts host/port. Start uses an ephemeral port; stop always affects the selected target." {})))
    (begin-change! runtime)
    (try
      (case action
        "start"
        (do
          (when (owned-process runtime) (throw (ex-info "Already managing a JVM; stop it explicitly before starting another" {})))
          (when (try (when (:port (selected-service runtime)) (probe (selected-service runtime)))
                     (catch Exception _ false))
            (throw (ex-info "A selected nREPL is already live. Stop/detach explicitly before starting a new JVM." {})))
          (let [{:keys [process port]} (launcher/start-nrepl-process
                                        {:start-nrepl-cmd (managed-command runtime) :project-dir project})]
            (try
              (probe (assoc @client :host "127.0.0.1" :port port))
              (swap! client assoc :host "127.0.0.1" :port port :nrepl-process process)
              (swap! state assoc :detached false)
              (catch Exception e (launcher/destroy-nrepl-process process) (throw e)))))

        "attach"
        (let [host (or host "127.0.0.1")
              same? (and (= port (:port @client))
                         (= (InetAddress/getByName host)
                            (InetAddress/getByName (or (:host @client) "127.0.0.1"))))]
          (when-not same? (acknowledge! runtime args))
          ;; Validate the replacement before terminating any owned process.
          (probe (assoc @client :host host :port port))
          (when-not same? (stop-owned! runtime))
          (swap! client #(cond-> (assoc % :host host :port port) (not same?) (dissoc :nrepl-process)))
          (swap! state assoc :detached false))

        "stop"
        (do (acknowledge! runtime args)
            (stop-owned! runtime)
            (swap! client dissoc :port :nrepl-process)
            (swap! state assoc :detached true)))
      (swap! state update :generation inc)
      (finally (swap! state assoc :changing false)))
    (assoc (status runtime) :action action)))

(defn shutdown! [runtime]
  ;; Shutdown is idempotent and can only terminate the Process we launched.
  (stop-owned! runtime))

(defn wrap-evaluation [runtime tool]
  (let [{:keys [state eval-lock]} runtime
        original (:tool-fn tool)]
    (assoc tool :tool-fn
           (fn [exchange args callback]
             (let [accepted?
                   (loop []
                     (let [old @state]
                       (if (:changing old) false
                         (if (compare-and-set! state old (update old :evaluations inc)) true (recur)))))]
               (if-not accepted?
                 (callback ["Runtime target change in progress; evaluation was not submitted."] true)
                 (future
                   ;; Serialize first-use initialization too, not just target evals.
                   (locking eval-lock
                     (let [finished (promise) once (atom false)
                           complete (fn [result error?]
                                      (when (compare-and-set! once false true)
                                        (try (callback result error?)
                                             (finally (swap! state update :evaluations dec)
                                                      (deliver finished true)))))]
                       (try
                         (when (and (:detached @state) (nil? (get args "port")))
                           (throw (ex-info "Detached. Attach/start a runtime or supply an explicit evaluation port." {})))
                         (original exchange args complete)
                         (catch Throwable e (complete [(ex-message e)] true)))
                       @finished)))))))))

(defn tool-maps [runtime]
  [{:id :runtime_status :name "runtime_status"
    :description "Check the selected nREPL's actual protocol readiness, JVM PID/cwd/versions and process ownership. Never starts a JVM or changes the evaluation session's history/error. Namespace is explicitly last reported by evaluation, not a fresh namespace query. MCP connected does not imply nREPL ready."
    :annotations {:read-only? true :destructive? false :idempotent? true :open-world? true}
    :schema {:type "object" :properties {} :additionalProperties false}
    :tool-fn (fn [_ _ callback]
               (future (try (callback [(json/write-str (status runtime))] false)
                            (catch Exception e (callback [(json/write-str {:schemaVersion 1 :error (ex-message e)})] true)))))}
   {:id :clojure_repl :name "clojure_repl"
    :description "Explicitly start a fresh local JVM on an ephemeral port, attach to an existing loopback nREPL, or stop/detach. Start never replaces a live target. Stop never terminates an external JVM. Stopping/replacing a managed JVM requires confirm_state_loss=true and LOSES ITS HEAP with no replay. Target changes reject active/queued eval requests. Managed JVMs also end when this MCP server closes: Pi reload/exit, session replacement or MCP reconnect. No sandbox or verified thread cancellation."
    :annotations {:read-only? false :destructive? true :idempotent? false :open-world? true}
    :schema {:type "object" :properties {:action {:type "string" :enum ["start" "attach" "stop"]}
                                         :port {:type "integer" :minimum 1 :maximum 65535}
                                         :host {:type "string" :enum ["127.0.0.1" "localhost" "::1"]}
                                         :confirm_state_loss {:type "boolean"}}
             :required ["action"] :additionalProperties false}
    :tool-fn (fn [_ args callback]
               (future
                 (try (callback [(json/write-str (change! runtime (tools/keywordize-keys-preserve-underscores args)))] false)
                      (catch Exception e
                        (callback [(json/write-str {:schemaVersion 1 :error (ex-message e)})] true)))))}])
