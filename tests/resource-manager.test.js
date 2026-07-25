"use strict";

const { loadBrowserScript } = require("./helpers/browser-loader");

function createResourceManager() {
  const context = loadBrowserScript("resourceManager.js");
  const ResourceManager = context.window.ResourceManager;
  return new ResourceManager();
}

// Regression test for a bug found during audit: enrichQuizWithAudio() used to
// unconditionally overwrite every question's `audio` field with a computed
// filename, even for "partial_audio" quizzes (quiz #5 in each theme) where
// the content JSON deliberately omits `audio` on some questions and no
// corresponding .mp3 file exists on disk for those — the generated filename
// pointed at a file that doesn't exist (see audio/Colors/, which only has
// TYF_Colors_5_{2,4,6,8,10}.mp3, never the odd-numbered ones).
test("enrichQuizWithAudio respects an already-omitted audio field on a partial_audio quiz", () => {
  const rm = createResourceManager();
  const quizData = {
    questions: [
      { question: "Q1" }, // no audio in source content
      { question: "Q2", audio: "TYF_Colors_5_2.mp3" },
      { question: "Q3" }
    ]
  };

  // themeId 1 = Colors, quizId ending in 5 = quizNumber 5 = "partial_audio"
  rm.enrichQuizWithAudio(quizData, 1, 105);

  expect(quizData.questions[0].audio).toBeUndefined();
  expect(quizData.questions[1].audio).toBe("TYF_Colors_5_2.mp3");
  expect(quizData.questions[2].audio).toBeUndefined();
});

test("enrichQuizWithAudio fills in a missing audio field on a full_audio quiz", () => {
  const rm = createResourceManager();
  const quizData = {
    questions: [{ question: "Q1" }, { question: "Q2" }]
  };

  // quizId ending in 3 = quizNumber 3 = "full_audio" (every question has audio)
  rm.enrichQuizWithAudio(quizData, 1, 103);

  expect(quizData.questions[0].audio).toBe("TYF_Colors_3_1.mp3");
  expect(quizData.questions[1].audio).toBe("TYF_Colors_3_2.mp3");
});

test("enrichQuizWithAudio does not touch text-only quizzes", () => {
  const rm = createResourceManager();
  const quizData = { questions: [{ question: "Q1" }] };

  // quizId ending in 1 = quizNumber 1 = not in audioQuizTypes at all
  rm.enrichQuizWithAudio(quizData, 1, 101);

  expect(quizData.questions[0].audio).toBeUndefined();
});
