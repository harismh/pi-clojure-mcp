(ns pi-clojure.test-runner
  (:require [clojure.test :as test]
            [pi-clojure.guidance-test]
            [pi-clojure.runtime-test]))

(defn -main [& _]
  (let [result (test/run-tests 'pi-clojure.guidance-test 'pi-clojure.runtime-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ (:fail result) (:error result))) 0 1))))
