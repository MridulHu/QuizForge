import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import {
  Brain,
  Trash2,
  Loader2,
  ArrowLeft,
  ChevronDown,
  Download,
  Search,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Attempt {
  id: string;
  participant_name: string;
  score: number;
  total_questions: number;
  completed_at: string;
  time_taken_seconds?: number;
  tab_switch_count?: number;
}

interface LeaderboardEntry {
  participant_name: string;
  correct_count: number;
  total_questions: number;
}

export default function QuizHistory() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"latest" | "highest">("latest");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  /* ---------------- LOAD ---------------- */
useEffect(() => {
  const loadData = async () => {
    const { data: attemptsData } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("quiz_id", quizId)
      .order("completed_at", { ascending: false });

    const { data: leaderboardData } = await supabase
      .from("quiz_leaderboard")
      .select("participant_name, correct_count, total_questions")
      .eq("quiz_id", quizId);

    if (attemptsData) setAttempts(attemptsData);
    if (leaderboardData) setLeaderboard(leaderboardData);
  };

  loadData();
}, [quizId]);

  /* ---------------- HELPERS ---------------- */

  const getSemiCircleValues = (percent: number) => {
  const radius = 26;
  const circumference = Math.PI * radius; // half circle
  const offset = circumference - (percent / 100) * circumference;
  return { radius, circumference, offset };
};

  const getScorePercent = (score: number, total: number) =>
    Math.round((score / total) * 100);

  const getScoreColor = (percent: number) => {
    if (percent >= 80) return "bg-green-500";
    if (percent >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  /* ---------------- GROUP ---------------- */
  const groupedAttempts = useMemo(() => {
    let filtered = attempts.filter((a) =>
      a.participant_name.toLowerCase().includes(search.toLowerCase())
    );

    filtered = [...filtered].sort((a, b) => {
      if (filter === "highest") return b.score - a.score;
      return (
        new Date(b.completed_at).getTime() -
        new Date(a.completed_at).getTime()
      );
    });

    const groups: Record<string, Attempt[]> = {};
    filtered.forEach((a) => {
      if (!groups[a.participant_name]) groups[a.participant_name] = [];
      groups[a.participant_name].push(a);
    });

    return groups;
  }, [attempts, search, filter]);

  const leaderboardMap = useMemo(() => {
  const map: Record<string, LeaderboardEntry> = {};
  leaderboard.forEach((entry) => {
    map[entry.participant_name] = entry;
  });
  return map;
}, [leaderboard]);

  /* ---------------- DELETE ---------------- */
  const deleteAttempt = async (id: string) => {
    setLoadingId(id);
    await supabase.from("quiz_attempts").delete().eq("id", id);
    setAttempts((prev) => prev.filter((a) => a.id !== id));
    setLoadingId(null);
  };

  const deleteUserAttempts = async (name: string) => {
    await supabase
      .from("quiz_attempts")
      .delete()
      .eq("quiz_id", quizId)
      .eq("participant_name", name);

    setAttempts((prev) => prev.filter((a) => a.participant_name !== name));
  };

  /* ---------------- EXPORT ---------------- */
  const exportCSV = () => {
    if (!attempts.length) return;

    const rows = [
      ["Name", "Score", "Total Questions", "Time Taken", "Tab Switches", "Completed At"],
      ...attempts.map((a) => [
        a.participant_name,
        a.score,
        a.total_questions,
        formatDuration(a.time_taken_seconds),
        a.tab_switch_count ?? 0,
        new Date(a.completed_at).toLocaleString(),
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ).join("\n");

    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "quiz_attempts.csv";
    link.click();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur-md">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>

            <div>
              <h1 className="text-lg font-bold">Attempt History</h1>
              <p className="text-xs text-muted-foreground">
                {attempts.length} attempts
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={!attempts.length}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </header>

      {/* MAIN */}
      <main className="container max-w-6xl py-10 space-y-6">
        {/* SEARCH */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search student..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={filter === "latest" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("latest")}
            >
              Latest
            </Button>

            <Button
              variant={filter === "highest" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("highest")}
            >
              Highest
            </Button>
          </div>
        </div>

        {/* USERS */}
        {Object.entries(groupedAttempts).map(([name, userAttempts]) => (
          <div key={name} className="rounded-2xl border bg-card overflow-hidden">
            
            {/* PROFILE HEADER */}
            <button
              onClick={() =>
                setExpandedUser(expandedUser === name ? null : name)
              }
              className="w-full flex items-center justify-between px-6 py-5 hover:bg-muted/30 transition"
            >
              <div className="flex items-center gap-6 relative">
                {/* LETTER PROFILE CARD */}
                {leaderboardMap[name] && (() => {
                  const latest = leaderboardMap[name];
                  const percent = Math.round(
                    (latest.correct_count / latest.total_questions) * 100
                  );

                  const radius = 28;
                  const centerX = 40;
                  const centerY = 40;

                  const startX = centerX;
                  const startY = centerY - radius; // 12 o'clock

                  const endAngle = Math.PI * percent / 100; // 0 → π (half circle)
                  const endX = centerX + radius * Math.sin(endAngle);
                  const endY = centerY - radius * Math.cos(endAngle);

                  return (
                    <div className="relative h-16 w-16 flex items-center justify-center">
                      <svg
                        width="80"
                        height="80"
                        viewBox="0 0 80 80"
                        className="absolute"
                      >
                        {/* Background 12 → 6 arc */}
                        <path
                          d={`
                            M ${centerX} ${centerY - radius}
                            A ${radius} ${radius} 0 0 1 ${centerX} ${centerY + radius}
                          `}
                          fill="none"
                          stroke="hsl(var(--muted))"
                          strokeWidth="6"
                        />

                        {/* Progress Arc 12 → dynamic position */}
                        <path
                          d={`
                            M ${startX} ${startY}
                            A ${radius} ${radius} 0 ${
                              percent > 50 ? 1 : 0
                            } 1 ${endX} ${endY}
                          `}
                          fill="none"
                          stroke={
                            percent >= 80
                              ? "#22c55e"
                              : percent >= 50
                              ? "#eab308"
                              : "#ef4444"
                          }
                          strokeWidth="6"
                          strokeLinecap="round"
                          style={{ transition: "all 0.6s ease" }}
                        />
                      </svg>

                      {/* Avatar */}
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary relative z-10">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  );
                })()}

                <div className="text-left space-y-1">
                  <p className="font-semibold text-base">{name}</p>

                  {/* Latest Attempt Shrink Card */}
                  {leaderboardMap[name] && (() => {
                    const latest = leaderboardMap[name];
                    const percent = Math.round(
                      (latest.correct_count / latest.total_questions) * 100
                    );

                    return (
                      <div className="mt-1 space-y-1">
                        <div className="inline-flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1 text-xs font-medium">
                          <span className="">
                            Correct: {latest.correct_count}
                          </span>
                          <span className="text-muted-foreground">
                            Latest Attempt
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-xs text-muted-foreground">
                    {userAttempts.length} attempts
                  </p>
                </div>
              </div>

              <ChevronDown
                className={`h-5 w-5 transition-transform duration-300 ${
                  expandedUser === name ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* EXPANDED */}
            <div
              className={`transition-all duration-300 overflow-hidden ${
                expandedUser === name
                  ? "max-h-[2000px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div className="border-t px-6 py-6 space-y-5">
                {userAttempts.map((a) => {
                  const percent = getScorePercent(
                    a.score,
                    a.total_questions
                  );

                  return (
                    <div
                      key={a.id}
                      className="relative flex flex-col gap-4 rounded-xl border bg-muted/20 p-5 pr-14 hover:bg-muted/30 transition"
                    >
                      {/* LEFT */}
                      <div className="flex-1 space-y-3">
                        {/* SCORE HEADER */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">
                              {a.score}/{a.total_questions}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {percent}% Score
                            </p>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {new Date(a.completed_at).toLocaleString()}
                          </p>
                        </div>

                        {/* PROGRESS BAR */}
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getScoreColor(percent)} transition-all`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        {/* META INFO */}
                        <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                          <span>⏱ {formatDuration(a.time_taken_seconds)}</span>
                          <span
                            className={
                              (a.tab_switch_count || 0) > 0
                                ? "text-red-600 font-medium"
                                : "text-green-600 font-medium"
                            }
                          >
                            Tab Switches: {a.tab_switch_count ?? 0}
                          </span> 
                        </div>
                      </div>

                      {/* DELETE */}
                      <div className="absolute top-5 right-5">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={loadingId === a.id}
                            className="text-muted-foreground hover:text-red-600"
                          >
                            {loadingId === a.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>

                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete this attempt?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600"
                              onClick={() => deleteAttempt(a.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    </div>
                  );
                })}

                {/* DELETE ALL */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full">
                      Delete All Attempts for {name}
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete all attempts for {name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove every attempt.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600"
                        onClick={() => deleteUserAttempts(name)}
                      >
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}