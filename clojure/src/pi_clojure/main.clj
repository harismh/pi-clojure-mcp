(ns pi-clojure.main
  (:require [clojure-mcp.core :as core]
            [clojure-mcp.main :as upstream]
            [clojure-mcp.config :as config]
            [clojure-mcp.logging :as logging]
            [pi-clojure.guidance :as guidance]
            [pi-clojure.runtime :as runtime]))

(def tool-names #{"clojure_eval" "list_nrepl_ports" "paren_repair"})
(def tool-ids [:clojure_eval :list_nrepl_ports :paren_repair :runtime_status :clojure_repl])

(defn options [args]
  (when (odd? (count args)) (throw (ex-info "Expected --option value pairs" {})))
  (reduce (fn [result [flag value]]
            (case flag
              "--project-dir" (assoc result :project-dir value)
              "--clojure-command" (assoc result :clojure-command value)
              "--host" (assoc result :host (runtime/valid-host! value))
              "--port" (assoc result :port (runtime/valid-port! (parse-long value)))
              (throw (ex-info (str "Unknown option: " flag) {}))))
          {:host "127.0.0.1" :clojure-command "clojure"} (partition 2 args)))

(defn start! [opts]
  (when-not (:project-dir opts) (throw (ex-info "--project-dir is required" {})))
  (logging/configure-logging! {:enable-logging? false})
  (let [opts (binding [*out* *err*] (core/validate-options (assoc opts :config-profile :repl :enable-tools tool-ids)))
        client core/nrepl-client-atom
        _ (reset! client (core/create-and-start-nrepl-connection opts))
        controller (runtime/controller client opts)
        factories {:make-tools-fn
                   (fn [client working-dir]
                     (map guidance/with-development-guidance
                          (concat
                           (for [tool (upstream/make-tools client working-dir)
                                 :when (contains? tool-names (:name tool))]
                             (if (= "clojure_eval" (:name tool))
                               (runtime/wrap-evaluation controller tool)
                               tool))
                           (runtime/tool-maps controller))))}
        result (core/setup-mcp-server client
                                           (config/get-nrepl-user-dir @client)
                                           factories
                                           (fn [] {:mcp-server
                                             (core/mcp-server
                                               (str "Persistent Clojure development. Use runtime_status to check the target, not merely MCP connectivity. JVM startup is explicit; managed state ends with this server. Conversation navigation does not rewind application state.\n\n"
                                                 guidance/reminder))}))]
      (swap! client assoc :mcp-server (:mcp-server result))
      controller))

(defn -main [& args]
  (try
    (start! (options args))
    (catch Exception e
      (binding [*out* *err*] (println "pi-clojure-mcp:" (ex-message e)))
      (System/exit 1))))
