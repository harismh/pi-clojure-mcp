(ns pi-clojure.runtime-test
  (:require [clojure.test :refer [deftest is use-fixtures]]
            [clojure.java.io :as io]
            [clojure-mcp.nrepl :as upstream]
            [nrepl.server :as server]
            [pi-clojure.runtime :as runtime])
  (:import [java.nio.file Files]
           [java.nio.file.attribute FileAttribute]
           [java.net ServerSocket]))

(def ^:dynamic *target* nil)
(def ^:dynamic *directory* nil)
(defn fixture [f]
  (let [target (server/start-server :bind "127.0.0.1" :port 0)
        directory (.toFile (Files/createTempDirectory "pi-clojure-unit-" (make-array FileAttribute 0)))]
    (try (binding [*target* target *directory* (.getCanonicalPath directory)] (f))
         (finally (server/stop-server target)
                  (doseq [file (reverse (file-seq directory))] (io/delete-file file true))))))
(use-fixtures :each fixture)
(defn service [] (upstream/create {:host "127.0.0.1" :port (:port *target*)}))
(defn controller [] (runtime/controller (atom (service)) {:project-dir *directory*}))
(defn evaluate [service code]
  (let [connection (upstream/open-connection service 3000)]
    (try (upstream/eval-code* service connection code {})
         (finally (upstream/close-connection connection)))))

(deftest validation
  (doseq [port [nil 0 -1 65536 1.5 "7888"]] (is (thrown? Exception (runtime/valid-port! port))))
  (doseq [host ["0.0.0.0" "example.com" "127.0.0.1; exit"]] (is (thrown? Exception (runtime/valid-host! host))))
  (is (= 65535 (runtime/valid-port! 65535))))

(deftest status-is-fresh-and-preserves-history
  (let [service (service) c (runtime/controller (atom service) {:project-dir *directory*})
        evaluated (evaluate service "(ns pi-clojure-test.application) (def kept (atom 41)) (+ 20 22) (throw (ex-info \"saved\" {}))")
        ;; Test-only access to nREPL's binding store avoids a measurement eval
        ;; itself changing *1/*2/*3. Production code uses only public APIs.
        sessions @(var-get (ns-resolve 'nrepl.middleware.session 'sessions))
        session (get sessions (:session-id evaluated))
        before (select-keys @session [#'*1 #'*2 #'*3 #'*e #'*ns*])
        status (runtime/status c)]
    (is (:ready status))
    (is (= "external" (:ownership status)))
    (is (= (str (.pid (java.lang.ProcessHandle/current))) (:pid status)))
    (is (= "pi-clojure-test.application" (:namespace status)))
    (is (= "last-evaluation" (:namespaceSource status)))
    (is (= before (select-keys @session (keys before))))
    (is (false? (upstream/port-initialized? service)))
    (is (= *directory* (:project status)))
    (is (= (System/getProperty "user.dir") (:cwd status)))))

(deftest tcp-listening-is-not-nrepl-readiness
  (with-open [socket (ServerSocket. 0)]
    (let [c (runtime/controller (atom (upstream/create {:host "127.0.0.1" :port (.getLocalPort socket)}))
                                {:project-dir *directory*})
          result (runtime/status c)]
      (is (false? (:ready result)))
      (is (re-find #"timed out|complete response" (:reason result))))))

(deftest no-implicit-start
  (let [c (runtime/controller (atom (upstream/create {:host "127.0.0.1"})) {:project-dir *directory*})]
    (is (= "none" (:ownership (runtime/status c))))
    (is (false? (:ready (runtime/status c))))
    (is (nil? (runtime/owned-process c)))))

(deftest queued-evaluations-are-serialized-and-protect-lifecycle
  (let [c (controller) order (atom []) started (promise) release (promise)
        tool (runtime/wrap-evaluation c {:tool-fn (fn [_ args callback]
                                                 (swap! order conj (get args "id"))
                                                 (deliver started true)
                                                 @release
                                                 (callback ["ok"] false))})
        first-result (promise) second-result (promise)]
    ((:tool-fn tool) nil {"id" 1} #(deliver first-result [%1 %2]))
    (is (= true (deref started 2000 :timed-out)))
    ((:tool-fn tool) nil {"id" 2} #(deliver second-result [%1 %2]))
    (is (= 2 (:evaluations @(:state c))))
    (is (thrown-with-msg? Exception #"active" (runtime/change! c {:action "stop"})))
    (is (:ready (runtime/status c)) "status uses an independent session while eval is busy")
    (is (= [1] @order))
    (deliver release true)
    (is (= [["ok"] false] (deref first-result 2000 :timed-out)))
    (is (= [["ok"] false] (deref second-result 2000 :timed-out)))
    (is (= [1 2] @order))
    (loop [remaining 100]
      (when (and (pos? remaining) (pos? (:evaluations @(:state c))))
        (Thread/sleep 5) (recur (dec remaining))))
    (is (zero? (:evaluations @(:state c))))))

(deftest failed-delegate-releases-the-lifecycle-gate
  (let [c (controller) result (promise)
        wrapped (runtime/wrap-evaluation c {:tool-fn (fn [& _] (throw (AssertionError. "delegate failed")))})]
    ((:tool-fn wrapped) nil {} #(deliver result [%1 %2]))
    (is (= [["delegate failed"] true] (deref result 2000 :timed-out)))
    (loop [remaining 100]
      (when (and (pos? remaining) (pos? (:evaluations @(:state c))))
        (Thread/sleep 5) (recur (dec remaining))))
    (is (zero? (:evaluations @(:state c))))))

(deftest racing-status-is-explicitly-stale
  (let [c (controller)]
    (with-redefs [runtime/probe (fn [_] (swap! (:state c) assoc :changing true) {:ready true})]
      (is (true? (:stale (runtime/status c)))))))

(deftest external-stop-only-detaches
  (let [c (controller)]
    (is (= "external" (:ownership (runtime/change! c {:action "attach" :port (:port *target*)}))))
    (is (= "none" (:ownership (runtime/change! c {:action "stop"}))))
    (is (:ready (runtime/probe (service))))
    (runtime/shutdown! c)
    (is (:ready (runtime/probe (service))))))

(deftest managed-lifecycle
  (let [c (runtime/controller (atom (upstream/create {:host "127.0.0.1"})) {:project-dir *directory*})
        marker (io/file *directory* ".nrepl-port")]
    (spit marker "65534")
    (swap! (:state c) assoc :detached true)
    (try
      (let [status (runtime/change! c {:action "start"})
            process (runtime/owned-process c)]
        (is (:ready status))
        (is (= "managed" (:ownership status)))
        (is (= (str (.pid ^Process process)) (:pid status)))
        (is (= "65534" (slurp marker)) "managed startup never replaces .nrepl-port")
        (is (thrown-with-msg? Exception #"STATE LOSS" (runtime/change! c {:action "stop"})))
        (is (thrown-with-msg? Exception #"STATE LOSS" (runtime/change! c {:action "attach" :port (:port *target*)})))
        (is (thrown-with-msg? Exception #"Only attach" (runtime/change! c {:action "stop" :port (:port status) :confirm_state_loss true})))
        (is (.isAlive ^Process process))
        (is (= "managed" (:ownership (runtime/change! c {:action "attach" :host "localhost" :port (:port status)}))))
        (is (.isAlive ^Process process) "a loopback alias must not kill the same managed JVM")
        (with-open [not-nrepl (ServerSocket. 0)]
          (is (thrown? Exception (runtime/change! c {:action "attach" :port (.getLocalPort not-nrepl) :confirm_state_loss true})))
          (is (.isAlive ^Process process) "a failed replacement probe must retain the owned JVM"))
        (is (= "external" (:ownership (runtime/change! c {:action "attach" :port (:port *target*) :confirm_state_loss true}))))
        (is (false? (.isAlive ^Process process)))
        (runtime/change! c {:action "stop"})
        (is (:ready (runtime/probe (service)))))
      (finally (runtime/shutdown! c)))))
