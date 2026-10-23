(ns pi-clojure.guidance
  "A small shared cue, not a second copy of the on-demand development skill.")

(def skill-name "repl-driven-development")
(def reminder
  (str "REPL-first development: consult the " skill-name
       " skill; let small evaluations and observed values guide the next change."))

(defn with-development-guidance
  "Append guidance without changing a tool's schema, executor, or safety contract."
  [tool]
  (let [description (or (:description tool) "")]
    (if (.endsWith ^String description reminder)
      tool
      (assoc tool :description (str description "\n\n" reminder)))))
