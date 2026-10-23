(ns pi-clojure.guidance-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]
            [pi-clojure.guidance :as guidance]))

(deftest guidance-preserves-the-tool-contract
  (let [original {:name "example" :description "Original safety and usage contract."
                  :schema {:type "object" :required ["action"]}
                  :tool-fn identity :annotations {:destructive? true}}
        decorated (guidance/with-development-guidance original)]
    (is (str/starts-with? (:description decorated) (:description original)))
    (is (str/ends-with? (:description decorated) guidance/reminder))
    (is (str/includes? (:description decorated) guidance/skill-name))
    (is (= (dissoc original :description) (dissoc decorated :description)))
    (is (identical? (:schema original) (:schema decorated)))
    (is (identical? (:tool-fn original) (:tool-fn decorated)))
    (is (identical? decorated (guidance/with-development-guidance decorated)))))

(deftest guidance-does-not-need-a-preexisting-description
  (doseq [tool [{:name "example"} {:name "example" :description nil} {:name "example" :description ""}]]
    (let [decorated (guidance/with-development-guidance tool)]
      (is (str/ends-with? (:description decorated) guidance/reminder))
      (is (= (:name tool) (:name decorated))))))
