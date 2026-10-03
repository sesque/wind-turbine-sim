// challenges.js
// The three challenge questions. It builds the questions on the page, checks
// the student's answers and gives hints.
//
// Rule: the right answers are worked out by physics.js (powerChangeFactor and
// percentPowerLost), never typed in by hand. So they stay correct if a number
// in physics.js ever changes.

// A "situation" is the three slider settings: wind speed, blade length, direction.
function situation(windSpeedMs, bladeLengthMetres, angleDegrees) {
  return { windSpeedMs: windSpeedMs, bladeLengthMetres: bladeLengthMetres, angleDegrees: angleDegrees };
}

// Each challenge compares two situations. "measure" says what the answer is:
//   "factor"      how many times more power the second situation makes
//   "percentLost" what percent of the power is lost going to the second situation
// "allowed" is how far off an answer may be and still count (percent for a
// factor, percentage points for percentLost).
const CHALLENGE_LIST = [
  {
    title: "The wind doubles",
    question:
      "Set the blade length to 60 m and the direction to 0°. Compare the power at 6 m/s " +
      "and at 12 m/s. How many times more power does the turbine make at 12 m/s?",
    situations: [situation(6, 60, 0), situation(12, 60, 0)],
    measure: "factor",
    allowed: 5,
    unitText: "times more",
    hints: [
      "Look at the formula P = ½ × ρ × A × v³. What happens to v³ when v doubles?",
      "v³ means v × v × v. Try it with v = 2 (that is the doubling): 2 × 2 × 2 = ?",
    ],
    commonMistake: {
      matches: function (answer, correct) { return Math.abs(answer - 2) < 0.2; },
      message: "That is how much the wind speed grew. Power grows faster than that, because the wind speed is cubed.",
    },
    explain: function (first, second, answer, format) {
      return "At 6 m/s the turbine makes " + format(first.electricPowerW) + " and at 12 m/s it makes " +
        format(second.electricPowerW) + ". That is about " + answer.toFixed(1) + " times more. " +
        "The wind only doubled, but power went up 2 × 2 × 2 = 8 times, because power depends on the wind speed cubed (v³).";
    },
  },
  {
    title: "Longer blades",
    question:
      "Set the wind to 8 m/s and the direction to 0°. Compare 40 m blades with 80 m blades. " +
      "The blades are twice as long. How many times more power do you get?",
    situations: [situation(8, 40, 0), situation(8, 80, 0)],
    measure: "factor",
    allowed: 5,
    unitText: "times more",
    hints: [
      "Blades sweep a circle, and its area is A = π × L². What happens to L² when the length L doubles?",
      "L² means L × L. With L doubled: 2 × 2 = ?",
    ],
    commonMistake: {
      matches: function (answer, correct) { return Math.abs(answer - 2) < 0.2; },
      message: "Not quite. Twice the length does not mean twice the power. The circle the blades sweep grows with the length squared.",
    },
    explain: function (first, second, answer, format) {
      return "40 m blades make " + format(first.electricPowerW) + " and 80 m blades make " +
        format(second.electricPowerW) + ". That is about " + answer.toFixed(1) + " times more. " +
        "Doubling the length makes the circle 2 × 2 = 4 times bigger, so the blades catch 4 times as much wind.";
    },
  },
  {
    title: "Facing away",
    question:
      "Set the wind to 10 m/s and the blade length to 60 m. Compare the power with the turbine " +
      "facing the wind (0°) and turned 45° away. About what percentage of the power is lost?",
    situations: [situation(10, 60, 0), situation(10, 60, 45)],
    measure: "percentLost",
    allowed: 5,
    unitText: "% lost",
    hints: [
      "Compare the two powers. Divide the power at 45° by the power at 0°. That gives the share that is kept.",
      "The question asks for what is lost, so take the share that is kept away from 100%.",
    ],
    commonMistake: {
      matches: function (answer, correct) { return Math.abs(answer - (100 - correct)) < 3; },
      message: "That is the part that is left. The question asks how much is lost.",
    },
    explain: function (first, second, answer, format) {
      const kept = 100 - answer;
      return "Facing the wind it makes " + format(first.electricPowerW) + ". Turned 45° it makes " +
        format(second.electricPowerW) + ". It keeps about " + kept.toFixed(0) + "%, so about " +
        answer.toFixed(0) + "% is lost. A turned turbine only feels part of the wind, and that part is then cubed.";
    },
  },
];

const WRONG_TRIES_BEFORE_ANSWER = 3;

// The right answer, worked out by physics.js.
function correctAnswer(challenge) {
  const first = challenge.situations[0];
  const second = challenge.situations[1];
  return challenge.measure === "factor"
    ? WindPhysics.powerChangeFactor(first, second)
    : WindPhysics.percentPowerLost(first, second);
}

function isCloseEnough(challenge, typed, correct) {
  const allowedDifference = challenge.measure === "factor" ? (correct * challenge.allowed) / 100 : challenge.allowed;
  return Math.abs(typed - correct) <= allowedDifference;
}

// options.formatPower(watts) gives text like "3.2 MW".
// options.setSliders(situation) moves the three sliders to a situation.
function initChallenges(container, progressElement, options) {
  const doneFlags = CHALLENGE_LIST.map(function () { return false; });

  function showProgress() {
    const done = doneFlags.filter(Boolean).length;
    progressElement.textContent = done === doneFlags.length
      ? "All " + done + " done. Well done!"
      : done + " of " + doneFlags.length + " done";
  }

  CHALLENGE_LIST.forEach(function (challenge, index) {
    let wrongTries = 0;
    const idPrefix = "challenge-" + index;

    const article = document.createElement("article");
    article.className = "challenge";

    const title = document.createElement("h3");
    title.textContent = (index + 1) + ". " + challenge.title;
    article.appendChild(title);

    const question = document.createElement("p");
    question.textContent = challenge.question;
    article.appendChild(question);

    // Buttons that set the sliders, so the student doesn't have to find the numbers.
    const buttons = document.createElement("p");
    buttons.className = "challenge-buttons";
    challenge.situations.forEach(function (oneSituation) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary";
      button.textContent = "Set sliders: " + oneSituation.windSpeedMs + " m/s, " +
        oneSituation.bladeLengthMetres + " m, " + oneSituation.angleDegrees + "°";
      button.addEventListener("click", function () {
        options.setSliders(oneSituation);
      });
      buttons.appendChild(button);
    });
    article.appendChild(buttons);

    const form = document.createElement("form");
    form.className = "answer-form";
    const label = document.createElement("label");
    label.htmlFor = idPrefix + "-answer";
    label.textContent = "Your answer (" + challenge.unitText + ")";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal"; // shows the number keyboard on phones
    input.id = idPrefix + "-answer";
    input.autocomplete = "off";
    const check = document.createElement("button");
    check.type = "submit";
    check.className = "button";
    check.textContent = "Check";
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(check);
    article.appendChild(form);

    const feedback = document.createElement("p");
    feedback.className = "feedback";
    feedback.setAttribute("aria-live", "polite");
    article.appendChild(feedback);

    function showResult(kind, text) {
      feedback.className = "feedback " + kind;
      feedback.textContent = text;
    }

    // The full explanation, using the real numbers from physics.js.
    function explanationText(correct) {
      const first = WindPhysics.calculate(
        challenge.situations[0].windSpeedMs, challenge.situations[0].bladeLengthMetres, challenge.situations[0].angleDegrees
      );
      const second = WindPhysics.calculate(
        challenge.situations[1].windSpeedMs, challenge.situations[1].bladeLengthMetres, challenge.situations[1].angleDegrees
      );
      return challenge.explain(first, second, correct, options.formatPower);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const typed = parseFloat(input.value.replace(",", ".")); // "8", "8x" and "64%" all work
      if (Number.isNaN(typed)) {
        showResult("hint-text", "Type a number first.");
        return;
      }
      const correct = correctAnswer(challenge);

      if (isCloseEnough(challenge, typed, correct)) {
        doneFlags[index] = true;
        showResult("right", "Yes! " + explanationText(correct));
        showProgress();
        return;
      }

      wrongTries++;
      if (wrongTries >= WRONG_TRIES_BEFORE_ANSWER) {
        showResult("wrong", "Not this time. The answer is about " + correct.toFixed(0) + " (" + challenge.unitText + "). " + explanationText(correct));
      } else if (challenge.commonMistake.matches(typed, correct)) {
        showResult("wrong", challenge.commonMistake.message);
      } else {
        showResult("wrong", "Not quite. Hint: " + challenge.hints[wrongTries - 1]);
      }
    });

    container.appendChild(article);
  });

  showProgress();
}

const Challenges = {
  init: initChallenges,
};
