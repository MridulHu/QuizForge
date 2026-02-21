import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brain, Info, Timer, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Question {
  id: string;
  question_text: string;
  options: string[];
  correct_option_index: number;
  order_num: number;
}

export default function SharedQuiz() {
  const { shareToken } = useParams();
  const { toast } = useToast();

  const [quizTitle, setQuizTitle] = useState("");
  const [quizId, setQuizId] = useState("");
  const [questions, setQuestions] = useState<Question[]>(() => {
    return JSON.parse(localStorage.getItem("quiz_questions") || "[]");
  });

  // ✅ Persist answers (refresh proof)
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    return JSON.parse(localStorage.getItem("quiz_answers") || "{}");
  });

  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ✅ Persist participant + started state
  const [participantName, setParticipantName] = useState(
    localStorage.getItem("quiz_participant") || "",
  );

  const [started, setStarted] = useState(
    localStorage.getItem("quiz_started") === "true",
  );

  // ✅ TIMER FIX
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // ✅ RETRIES FIX
  const [maxRetries, setMaxRetries] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const retriesLeft =
    maxRetries === 0 ? 0 : Math.max(maxRetries - attemptCount, 0);

  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [preventTabSwitch, setPreventTabSwitch] = useState(false);
  const [tabWarnings, setTabWarnings] = useState(3);
  const [preventCopyPaste, setPreventCopyPaste] = useState(false);
  const [randomiseQuestions, setRandomiseQuestions] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [openSubmitDialog, setOpenSubmitDialog] = useState(false);
  const [openNavDialog, setOpenNavDialog] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const [timeTaken, setTimeTaken] = useState<number>(0);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [openLeaderboard, setOpenLeaderboard] = useState(false);

  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(false);
const [negativeMarkValue, setNegativeMarkValue] = useState(0);

const [correctCount, setCorrectCount] = useState(0);
const [wrongCount, setWrongCount] = useState(0);
const [showScoreDetails, setShowScoreDetails] = useState(false);


  /* --------------------------------------------
     LOAD QUIZ + SETTINGS
  -------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      if (!shareToken) return;

      const { data: quiz } = await supabase
        .from("quizzes")
        .select(
          "id, title, duration_minutes, max_retries, sharing_enabled, show_answers, prevent_tab_switch, tab_switch_warnings, prevent_copy_paste,randomise_questions, leaderboard_enabled, negative_marking_enabled, negative_mark_value",
        )
        .eq("share_token", shareToken)
        .maybeSingle();

      if (!quiz) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!quiz.sharing_enabled) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      /* ✅ Save settings */
      setSharingEnabled(quiz.sharing_enabled ?? true);
      setShowAnswers(quiz.show_answers ?? true);
      setPreventTabSwitch(quiz.prevent_tab_switch ?? false);
      setTabWarnings(quiz.tab_switch_warnings ?? 3);
      setPreventCopyPaste(quiz.prevent_copy_paste ?? false);
      setRandomiseQuestions(quiz.randomise_questions ?? false);
      setLeaderboardEnabled(quiz.leaderboard_enabled ?? true);
      setNegativeMarkingEnabled(quiz.negative_marking_enabled ?? false);
      setNegativeMarkValue(Number(quiz.negative_mark_value ?? 0));

      setQuizTitle(quiz.title);
      setQuizId(quiz.id);

      setMaxRetries(quiz.max_retries || 0);

      // ✅ Timer restore logic (refresh cannot reset timer)
      if (quiz.duration_minutes) {
        setDurationMinutes(quiz.duration_minutes);

        // ✅ Restore saved timer first
        const savedTime = localStorage.getItem("quiz_time_left");

        if (savedTime) {
          setTimeLeft(parseInt(savedTime));
        } else {
          // First attempt → start fresh timer
          setTimeLeft(quiz.duration_minutes * 60);
        }
      }

      const { data: qs } = await supabase
        .from("questions")
        .select("*")
        .eq("quiz_id", quiz.id)
        .order("order_num");

      if (qs) {
        let finalQuestions = qs;

        // ✅ Randomise only if enabled
        if (quiz.randomise_questions) {
          finalQuestions = [...qs].sort(() => Math.random() - 0.5);
        }

        // ✅ Save into state
        setQuestions(finalQuestions);

        // ✅ Save into localStorage for auto-submit safety
        localStorage.setItem("quiz_questions", JSON.stringify(finalQuestions));
      }

      setLoading(false);
    };

    load();
  }, [shareToken]);

  /* --------------------------------------------
     SAVE ANSWERS (refresh proof)
  -------------------------------------------- */
  useEffect(() => {
    localStorage.setItem("quiz_answers", JSON.stringify(answers));
  }, [answers]);

  /* --------------------------------------------
     CHECK ATTEMPTS (refresh proof)
  -------------------------------------------- */
  const checkAttempts = async () => {
    if (!quizId || !participantName.trim()) return;

    // Count how many times this participant already submitted
    const { count } = await supabase
      .from("quiz_attempts")
      .select("*", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("participant_name", participantName);

    const attempts = count || 0;
    setAttemptCount(attempts);

    // ✅ Case 1: Retries disabled → only ONE submission allowed
    if (maxRetries === 0) {
      if (attempts >= 1) {
        setBlocked(true);
      } else {
        setBlocked(false);
      }
      return;
    }

    // ✅ Case 2: Retries enabled → allow up to maxRetries
    if (attempts >= maxRetries) {
      setBlocked(true);
    } else {
      setBlocked(false);
    }
  };

  /* Auto-block after refresh if exhausted */
  useEffect(() => {
    if (quizId && participantName.trim()) {
      checkAttempts(); // Always check, even when maxRetries = 0
    }
  }, [quizId, participantName, maxRetries]);

  /*  Toast immediately when blocked */
  useEffect(() => {
    if (!blocked) return;

    toast({
      title:
        maxRetries === 0
          ? "Submission already completed"
          : "Maximum retries reached",

      description:
        maxRetries === 0
          ? "This quiz allows only one attempt. You can no longer submit."
          : "You can no longer submit this quiz.",

      variant: "destructive",
    });
  }, [blocked, maxRetries]);

  /* --------------------------------------------
     TIMER COUNTDOWN + AUTO SUBMIT
  -------------------------------------------- */
  useEffect(() => {
    if (!started) return;
    if (submitted) return;
    if (timeLeft === null) return;

    if (timeLeft <= 0) {
      toast({
        title: "Time is up!",
        description: "Quiz auto-submitted.",
        variant: "destructive",
        duration: Infinity,
      });
      setTimeout(() => {
        handleSubmit(true);
      }, 200);

      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, submitted, started]);

  useEffect(() => {
    if (timeLeft === null) return;

    localStorage.setItem("quiz_time_left", timeLeft.toString());
  }, [timeLeft]);

  useEffect(() => {
    if (!preventTabSwitch) return;
    if (submitted) return;
    if (!started) return;
    if (isRetrying) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const next = incrementTabSwitch(); // ✅ SAVE instantly

        toast({
          title: "Warning: Tab/App Switch Detected",
          description: `Warnings left: ${Math.max(tabWarnings - next, 0)}`,
          variant: "destructive",
          duration: Infinity,
        });

        // ✅ Auto-submit after limit reached
        if (next >= tabWarnings) {
          toast({
            title: "Auto Submitted",
            description: "Too many tab/app switches detected.",
            variant: "destructive",
          });

          handleSubmit(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [preventTabSwitch, tabWarnings, submitted, started, toast, isRetrying]);

  useEffect(() => {
    if (!preventCopyPaste) return;

    const blockKeys = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ["c", "v", "x", "a"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", blockKeys);

    return () => {
      document.removeEventListener("keydown", blockKeys);
    };
  }, [preventCopyPaste]);

  useEffect(() => {
    if (!preventCopyPaste) return;

    const blockRightClick = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("contextmenu", blockRightClick, true);

    return () => {
      document.removeEventListener("contextmenu", blockRightClick, true);
    };
  }, [preventCopyPaste]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  /* --------------------------------------------
     NAME ENTRY GATE (Attempts removed here)
  -------------------------------------------- */

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="glass-card p-8 rounded-xl text-center max-w-md">
          <h2 className="text-2xl font-bold mb-2">Quiz Not Available</h2>
          <p className="text-muted-foreground">
            This quiz link is invalid or sharing has been disabled by the
            creator.
          </p>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="glass-card rounded-xl p-8 w-full max-w-md space-y-4">
          <h1 className="font-display text-2xl font-bold text-center">
            Enter Your Name
          </h1>

          <p className="text-muted-foreground text-center text-sm">
            You must enter your name before attempting this quiz.
          </p>

          <input
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="Your full name"
            className="w-full border rounded-lg p-3"
          />

          {blocked && (
            <p className="text-center text-destructive font-semibold">
              Retry limit reached. You cannot attempt again.
            </p>
          )}

          <Button
            className="w-full gradient-primary text-primary-foreground"
            disabled={!participantName.trim() || blocked}
            onClick={async () => {
              localStorage.setItem("quiz_participant", participantName);

              localStorage.setItem("quiz_tab_switches", "0");
              setWarningCount(0);

              await checkAttempts();

              if (!blocked) {
                localStorage.setItem("quiz_started", "true");
                localStorage.setItem("quiz_start_time", Date.now().toString());
                setStarted(true);
              }
            }}
          >
            Start Quiz
          </Button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------
     SELECT ANSWER (unchanged)
  -------------------------------------------- */
  const selectAnswer = (questionId: string, optionIndex: number) => {
    if (submitted) return;

    setAnswers((prev) => {
      const updated = { ...prev, [questionId]: optionIndex };

      // ✅ Save instantly (so auto-submit never misses)
      localStorage.setItem("quiz_answers", JSON.stringify(updated));

      return updated;
    });
  };

  const incrementTabSwitch = () => {
    const current = Number(localStorage.getItem("quiz_tab_switches") || "0");
    const next = current + 1;

    localStorage.setItem("quiz_tab_switches", next.toString());
    setWarningCount(next);

    return next;
  };

  //  Count unanswered questions
  const unansweredCount = questions.length - Object.keys(answers).length;

  // ✅ Handles submit button click
  const handleSubmitClick = () => {
    // If unanswered questions exist, open confirmation modal
    if (unansweredCount > 0) {
      setOpenSubmitDialog(true);
      return;
    }

    // Otherwise submit directly
    handleSubmit(false);
  };

  /* --------------------------------------------
     SUBMIT QUIZ (BLOCKED FIX ADDED)
  -------------------------------------------- */
  const handleSubmit = async (auto = false) => {
    if (blocked) {
      toast({
        title: "Maximum retries reached",
        description: "Submission disabled.",
        variant: "destructive",
      });
      return;
    }

    const latestAnswers: Record<string, number> = auto
      ? JSON.parse(localStorage.getItem("quiz_answers") || "{}")
      : answers;

    // ✅ Always use latest questions (state OR localStorage)
    const latestQuestions: Question[] =
      questions.length > 0
        ? questions
        : JSON.parse(localStorage.getItem("quiz_questions") || "[]");

    let correct = 0;
    let wrong = 0;

    latestQuestions.forEach((q) => {
      const selected = latestAnswers[q.id];

      if (selected === q.correct_option_index) {
        correct++;
      } else if (selected !== undefined) {
        wrong++;
      }
    });

    let finalScore = correct;

    if (negativeMarkingEnabled) {
      finalScore = correct - wrong * negativeMarkValue;

      // Prevent negative total score
      finalScore = Math.max(finalScore, 0);
    }

    setCorrectCount(correct);
    setWrongCount(wrong);
    setScore(finalScore);
    setSubmitted(true);

    let timeTakenSeconds = 0;

    // Read remaining time from localStorage (auto-submit safe)
    const savedTimeLeft = localStorage.getItem("quiz_time_left");

    // If quiz has a duration timer
    if (durationMinutes && savedTimeLeft) {
      timeTakenSeconds = durationMinutes * 60 - Number(savedTimeLeft);
    }

    // Backup fallback (only if duration not enabled)
    else {
      const startTime = localStorage.getItem("quiz_start_time");

      if (startTime) {
        timeTakenSeconds = Math.floor((Date.now() - Number(startTime)) / 1000);
      }
    }

    // Never allow 0 seconds
    timeTakenSeconds = Math.max(timeTakenSeconds, 1);
    setTimeTaken(timeTakenSeconds);

    const switches = Number(
      localStorage.getItem("quiz_tab_switches") || "0"
    );

    setTabSwitchCount(switches);

    await supabase.from("quiz_attempts").insert({
      quiz_id: quizId,
      user_id: null,
      participant_name: participantName,
      answers: latestAnswers,
      score: finalScore,
      total_questions: latestQuestions.length,
      time_taken_seconds: timeTakenSeconds,
      tab_switch_count: switches,
    });
    if (leaderboardEnabled) {
  const { data, error } = await supabase
    .from("quiz_leaderboard")
    .upsert(
      {
        quiz_id: quizId,
        participant_name: participantName,
        score: finalScore,
        correct_count: correct,
        total_questions: latestQuestions.length,
        time_taken_seconds: timeTakenSeconds,
        updated_at: new Date(),
      },
      {
        onConflict: "quiz_id,participant_name",
      }
    );

  if (error) {
    console.error("Leaderboard Upsert Error:", error);
  }
}

    await checkAttempts();
    setWarningCount(0);

    // ✅ Clear stored progress after submission
    localStorage.removeItem("quiz_answers");
    localStorage.removeItem("quiz_start_time");
    localStorage.removeItem("quiz_time_left");
    localStorage.removeItem("quiz_questions");
    localStorage.removeItem("quiz_tab_switches");
  };

  /* --------------------------------------------
     RETRY FIX
  -------------------------------------------- */
  const handleRetry = async () => {
    if (maxRetries > 0 && attemptCount >= maxRetries) {
      toast({ title: "No retries left", variant: "destructive" });
      setBlocked(true);
      return;
    }
    setIsRetrying(true);
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    setWarningCount(0);

    await checkAttempts();

    localStorage.setItem("quiz_tab_switches", "0");
    localStorage.removeItem("quiz_answers");
    localStorage.removeItem("quiz_time_left");
    localStorage.removeItem("quiz_start_time");
    localStorage.removeItem("quiz_questions");

    if (durationMinutes) {
      const freshTime = durationMinutes * 60;

      setTimeLeft(freshTime);

      // Save fresh timer immediately
      localStorage.setItem("quiz_time_left", freshTime.toString());
    }

    //  Reload page cleanly
    window.location.reload();
  };

  const fetchLeaderboard = async () => {
  const { data } = await supabase
    .from("quiz_leaderboard")
    .select("*")
    .eq("quiz_id", quizId)
    .order("score", { ascending: false })
    .order("time_taken_seconds", { ascending: true })
    .limit(20);

  if (data) setLeaderboard(data);
};

  const optionLabels = ["A", "B", "C", "D"];

  const scrollToQuestion = (index: number) => {
  setCurrentQuestion(index);

  const element = document.getElementById(`question-${index}`);

  if (element) {
    const headerOffset = 80; //  Adjust for sticky header height
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.scrollY - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
  }

  // Close navigator after click
  setNavOpen(false);
};

useEffect(() => {
  if (!openLeaderboard || !quizId) return;

  // Fetch immediately when modal opens
  fetchLeaderboard();

  const interval = setInterval(() => {
    fetchLeaderboard();
  }, 5000);

  return () => clearInterval(interval);
}, [openLeaderboard, quizId]);


  /* --------------------------------------------
   AUTO-DETECT CURRENT QUESTION ON SCROLL
-------------------------------------------- */
  useEffect(() => {
    if (questions.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"));

            setCurrentQuestion(index);
          }
        });
      },
      {
        threshold: 0.6, // 60% visible = active
      },
    );

    // Observe all question cards
    questions.forEach((_, index) => {
      const el = document.getElementById(`question-${index}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [questions]);

  /* --------------------------------------------
     MAIN UI (STYLING UNCHANGED)
  -------------------------------------------- */
  return (
    <div
      className="min-h-screen bg-background"
      style={{
        userSelect: preventCopyPaste ? "none" : "auto",
        WebkitUserSelect: preventCopyPaste ? "none" : "auto",
      }}
    >
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex min-h-[4rem] py-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-7 w-7 text-primary" />
            <span className="font-display text-lg font-bold ">{quizTitle}</span>
          </div>

          {durationMinutes && timeLeft !== null && !submitted && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted text-sm font-semibold">
              <Timer className="h-4 w-4 text-primary" />
              {formatTime(timeLeft)}
            </div>
          )}
        </div>
      </header>

      <main className="container py-8 max-w-3xl mb-20 lg:max-w-5xl xl:max-w-6xl">

        {submitted && (
  <div className="glass-card rounded-2xl p-6 mb-6 animate-scale-in">

    {/* ===== Top Row ===== */}
    <div className="flex flex-row items-center justify-between gap-4 text-center w-full">

      {/* Score */}
      <div className="flex flex-col items-center md:items-start">

  {/* Score Row */}
  <div className="flex items-center gap-2">

  <h2 className="font-display text-2xl font-bold">
    {score}
  </h2>

  <AlertDialog>
    <AlertDialogTrigger asChild>
      <button className="text-muted-foreground hover:text-primary transition">
        <Info className="h-4 w-4" />
      </button>
    </AlertDialogTrigger>

    <AlertDialogContent className="rounded-2xl w-[92%] max-w-sm p-6">

      <AlertDialogHeader>
        <AlertDialogTitle>
          Score Breakdown
        </AlertDialogTitle>

        <AlertDialogDescription>
          Detailed evaluation of your attempt
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="mt-4 space-y-3 text-sm">

        <div className="flex justify-between">
          <span>Correct Answers</span>
          <span className="font-semibold text-green-600">
            {correctCount}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Wrong Answers</span>
          <span className="font-semibold text-destructive">
            {wrongCount}
          </span>
        </div>

        {negativeMarkingEnabled && (
          <div className="flex justify-between">
            <span>Negative Mark</span>
            <span className="font-semibold">
              -{negativeMarkValue} per wrong
            </span>
          </div>
        )}

      </div>

      <AlertDialogFooter>
        <AlertDialogCancel>Close</AlertDialogCancel>
      </AlertDialogFooter>

    </AlertDialogContent>
  </AlertDialog>

</div>

  <p className="text-sm text-muted-foreground">
    Final Score
  </p>

</div>

      {/* Time Taken */}
      <div className="flex flex-col items-center">
        <p className="text-2xl font-semibold">
          {formatTime(timeTaken)}
        </p>
        <p className="text-sm text-muted-foreground">
          Time Taken
        </p>
      </div>

      {/* Tab Switches */}
      <div className="flex flex-col items-center">
        <p className="text-2xl font-semibold">
          {tabSwitchCount}
        </p>
        <p className="text-sm text-muted-foreground">
          Tab Switches
        </p>
      </div>

    </div>

    {/* ===== Retry Section ===== */}
   {/* ===== Action Section ===== */}
<div className="mt-6 pt-4 border-t flex flex-col items-center gap-3">

  <div className="flex gap-3">

    {maxRetries > 0 && !blocked && (
      <Button
        className="gradient-primary text-primary-foreground"
        onClick={handleRetry}
      >
        Retry Quiz
      </Button>
    )}

    {leaderboardEnabled && (
      <Button
        variant="outline"
        onClick={async () => {
          await fetchLeaderboard();
          setOpenLeaderboard(true);
        }}
      >
        Leaderboard
      </Button>
    )}

  </div>

  {maxRetries > 0 && !blocked && (
    <p className="text-sm text-muted-foreground">
      Retries left{" "}
      <span className="font-semibold text-foreground">
        {retriesLeft}/{maxRetries}
      </span>
    </p>
  )}

</div>

  </div>
)}

        <div className="space-y-4 ">
          {questions.map((q, qIndex) => (
            <div
              key={q.id}
              id={`question-${qIndex}`}
              data-index={qIndex}
              className="scroll-mt-24 rounded-2xl border bg-card p-5 lg:p-7 shadow-sm hover:shadow-md transition animate-fade-in"
            >
              <p
                className={`font-display font-semibold mb-3 ${
                  preventCopyPaste ? "no-copy" : ""
                }`}
              >
                <span className="text-muted-foreground mr-2">
                  {qIndex + 1}.
                </span>
                {q.question_text}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3">
                {q.options.map((opt, oIndex) => {
                  const isSelected = answers[q.id] === oIndex;
                  const isCorrect = q.correct_option_index === oIndex;

                  let borderClass = "border-border hover:border-primary/30";

                  // ✅ Selected option always stays blue (before + after submit)
                  if (isSelected) {
                    borderClass =
                      "border-primary bg-primary/10 ring-1 ring-primary";
                  }

                  // ✅ Only reveal correct/wrong if showAnswers is enabled
                  if (submitted && showAnswers) {
                    if (isCorrect) {
                      borderClass =
                        "border-accent bg-accent/10 ring-1 ring-accent";
                    } else if (isSelected && !isCorrect) {
                      borderClass =
                        "border-destructive bg-destructive/10 ring-1 ring-destructive";
                    }
                  }

                  return (
                    <button
                      key={oIndex}
                      onClick={() => selectAnswer(q.id, oIndex)}
                      disabled={submitted}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-all ${borderClass}`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          // ✅ Exam Mode: No correct/wrong reveal
                          submitted && !showAnswers
                            ? isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                            : // ✅ Normal Mode: Show correct + wrong after submit
                              submitted && showAnswers
                              ? isCorrect
                                ? "bg-accent text-accent-foreground"
                                : isSelected
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-muted text-muted-foreground"
                              : // ✅ Before submission
                                isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {optionLabels[oIndex]}
                      </span>
                      <span
                        className={`text-sm ${preventCopyPaste ? "no-copy" : ""}`}
                      >
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!submitted && questions.length > 0 && (
          <>
            {/* ===============================
        ✅ Animated Navigator Sheet
    =============================== */}
            <div
              className={`fixed inset-x-0 bottom-[72px] z-40 md:hidden transition-transform duration-300 ease-in-out
        ${navOpen ? "translate-y-0" : "translate-y-full"}`}
            >
              <div className="bg-card border-t shadow-2xl rounded-t-2xl p-4">
                {/* Handle Bar */}
                <div
                  className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4 cursor-pointer"
                  onClick={() => setNavOpen(false)}
                />

                <h3 className="text-sm font-semibold text-center mb-3">
                  Question Navigator
                </h3>

                {/* Question Pills */}
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 justify-items-center place-content-center">

                  {questions.map((q, i) => {
                    const answered = answers[q.id] !== undefined;
                    const active = currentQuestion === i;

                    let pillClass =
                      "bg-background border border-border text-muted-foreground hover:bg-muted";

                    if (answered)
                      pillClass = "bg-green-600 text-white border-green-600";

                    if (active)
                      pillClass = "bg-primary text-primary-foreground border-primary";


                    return (
                      <div className="">
                      <button
                        key={q.id}
                        onClick={() => scrollToQuestion(i)}
                        className={`h-9 w-9 rounded-full text-xs font-bold transition  ${pillClass}`}
                      >
                        {i + 1}
                      </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ===============================
        ✅ Sticky Bottom Bar
    =============================== */}
            <div className="fixed bottom-0 left-0 right-0 border-t bg-card/90 backdrop-blur-md p-4 z-50">
              <div className="max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto flex items-center justify-between gap-4">
                {/* Answered Left */}
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  Answered{" "}
                  <span className="font-semibold text-foreground">
                    {Object.keys(answers).length}/{questions.length}
                  </span>
                </p>

                {/* Desktop Navigator */}
              <div className="hidden md:flex flex-1 justify-center gap-2 overflow-x-auto px-2">
                {questions.map((q, i) => {
                  const answered = answers[q.id] !== undefined;
                  const active = currentQuestion === i;

                  let pillClass =
                    "bg-background border border-border text-muted-foreground hover:bg-muted";

                  if (answered) pillClass = "bg-green-600 text-white border-green-600";
                  if (active) pillClass = "bg-primary text-primary-foreground border-primary";

                  return (
                    <button
                      key={q.id}
                      onClick={() => scrollToQuestion(i)}
                      className={`h-8 w-8 rounded-full text-xs font-bold transition ${pillClass}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>


                {/* Navigator Button Center */}
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-full md:hidden hover:bg-primary/90 "
                  onClick={() => setNavOpen((prev) => !prev)}
                >
                  <ChevronUp
                    className={`h-5 w-5 transition-transform duration-300  ${
                      navOpen ? "rotate-180 " : ""
                    }`}
                  />
                </Button>

                {/* Submit Right */}
                <AlertDialog open={openSubmitDialog} onOpenChange={setOpenSubmitDialog}>
                {/* Submit Button */}
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={blocked}
                    className="gradient-primary text-primary-foreground px-6 whitespace-nowrap"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmitClick();
                    }}
                  >
                    Submit
                  </Button>
                </AlertDialogTrigger>

                {/* Warning Modal */}
                <AlertDialogContent
                  className="rounded-2xl w-[92%] max-w-md mx-auto p-6 shadow-xl "
                >

                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit Quiz?</AlertDialogTitle>

                    <AlertDialogDescription>
                      You still have{" "}
                      <b>{unansweredCount}</b>{" "}
                      unanswered question(s).
                      <br />
                      Are you sure you want to submit?
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <AlertDialogFooter>
                    <AlertDialogCancel>Continue Quiz</AlertDialogCancel>

                    <AlertDialogAction
                      onClick={() => {
                        setOpenSubmitDialog(false);
                        handleSubmit(false);
                      }}
                    >
                      Yes, Submit
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              </div>
            </div>
          </>
        )}
        {/* ===============================
         Leaderboard Modal
      =============================== */}
      <AlertDialog
        open={openLeaderboard}
        onOpenChange={setOpenLeaderboard}
      >
        <AlertDialogContent className="rounded-2xl w-[95%] max-w-lg">

          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
            Leaderboard
            <span className="text-xs text-green-600 font-medium animate-pulse">
              ● Live
            </span>
          </AlertDialogTitle>
            <AlertDialogDescription>
              Ranked by Score (High → Low) and Time (Fast → Slow)
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 max-h-[420px] overflow-y-auto mt-4 pr-1">
            

  {leaderboard.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-8">
      No attempts yet.
    </p>
  ) : (
    
    leaderboard.map((entry, index) => {
  const isCurrentUser =
    entry.participant_name === participantName;

  const percentage =
    entry.total_questions > 0
      ? Math.round(
          (entry.correct_count / entry.total_questions) * 100
        )
      : 0;

  const medal =
    index === 0
      ? "🥇"
      : index === 1
      ? "🥈"
      : index === 2
      ? "🥉"
      : null;

  return (
    <div
      key={entry.id}
      className={`relative rounded-2xl p-4 border transition-all duration-300
        ${
          isCurrentUser
            ? "border-primary bg-primary/10 shadow-md"
            : "border-border bg-card hover:shadow-sm"
        }
      `}
    >
      {/* Rank + Medal */}
      <div className="flex items-center justify-between">

        <div className="flex items-center gap-4">

          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted text-sm font-bold">
            {medal ? medal : index + 1}
          </div>

          <div>
            <p className={`font-semibold ${isCurrentUser ? "text-primary" : ""}`}>
              {entry.participant_name}
              {isCurrentUser && (
                <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                  You
                </span>
              )}
            </p>

            <p className="text-xs text-muted-foreground">
              {percentage}% accuracy
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold">
            {entry.score}
          </p>
          <p className="text-xs text-muted-foreground">
            ⏱ {formatTime(entry.time_taken_seconds)}
          </p>
        </div>

      </div>

      {/* Subtle Glow for Top 3 */}
      {index < 3 && (
        <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/10 pointer-events-none" />
      )}
    </div>
  );
})
  )}
</div>

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>

        </AlertDialogContent>
      </AlertDialog>
      </main>
    </div>
  );
}
