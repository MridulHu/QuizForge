import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, GripVertical } from "lucide-react";

interface Question {
  question_text: string;
  options: string[];
  correct_option_index: number;
}

interface ManualQuizBuilderProps {
  initialTitle?: string;
  initialQuestions?: Question[];
  quizId?: string;
  isEditing?: boolean;
}

/* ---------------- AUTO EXPAND INPUT ---------------- */

function AutoExpandInput({
  value,
  onChange,
  placeholder,
  className = "",
  onClick,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  onClick?: (e: any) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onClick={onClick}
      placeholder={placeholder}
      rows={1}
      className={`
        w-full resize-none overflow-hidden
        bg-transparent
        focus:outline-none
        leading-relaxed
        ${className}
      `}
    />
  );
}

/* ---------------- MAIN COMPONENT ---------------- */

export default function ManualQuizBuilder({
  initialTitle = "",
  initialQuestions,
  quizId,
  isEditing = false,
}: ManualQuizBuilderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(
    initialQuestions || [
      { question_text: "", options: ["", "", "", ""], correct_option_index: 0 },
    ]
  );
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const optionLabels = ["A", "B", "C", "D"];

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { question_text: "", options: ["", "", "", ""], correct_option_index: 0 },
    ]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: string, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) }
          : q
      )
    );
  };

  const setCorrectOption = (qIndex: number, oIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, correct_option_index: oIndex } : q
      )
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Please enter a quiz title", variant: "destructive" });
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) {
        toast({ title: `Question ${i + 1} is empty`, variant: "destructive" });
        return;
      }
      if (q.options.some((o) => !o.trim())) {
        toast({
          title: `All options in Q${i + 1} must be filled`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);

    try {
      let targetQuizId = quizId;

      if (isEditing && quizId) {
        await supabase.from("quizzes").update({ title }).eq("id", quizId);
        await supabase.from("questions").delete().eq("quiz_id", quizId);
      } else {
        const { data, error } = await supabase
          .from("quizzes")
          .insert({ title, user_id: user!.id })
          .select("id")
          .single();
        if (error) throw error;
        targetQuizId = data.id;
      }

      const questionRows = questions.map((q, i) => ({
        quiz_id: targetQuizId!,
        question_text: q.question_text,
        options: q.options,
        correct_option_index: q.correct_option_index,
        order_num: i,
      }));

      const { error: qError } = await supabase
        .from("questions")
        .insert(questionRows);

      if (qError) throw qError;

      toast({ title: isEditing ? "Quiz updated!" : "Quiz created!" });
      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }

    setSaving(false);
  };

  function formatAssertionReason(text: string) {
  if (!text.includes("Assertion:") || !text.includes("Reason:")) {
    return text; // Normal MCQ — leave untouched
  }

  return text.replace(
    /\s*Reason:\s*/i,
    "\nReason: "
  );
}
  

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto ">

      {/* ---------------- TITLE ---------------- */}

      <div className="space-y-2">
        <Label className="text-base font-semibold ml-2.5">
          Quiz Title
        </Label>

        <div className="rounded-xl border bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-primary/40 transition">
          <AutoExpandInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Biology Chapter 5 Review"
            className="text-lg font-semibold"
          />
        </div>
      </div>

      {/* ---------------- QUESTIONS ---------------- */}

      <div className="space-y-6">
        {questions.map((q, qIndex) => (
          <div
            key={qIndex}
            className="glass-card rounded-xl p-6 space-y-5 hover:shadow-lg transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm text-muted-foreground">
                  Question {qIndex + 1}
                </span>
              </div>

              {questions.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeQuestion(qIndex)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="rounded-lg border bg-card px-4 py-3 focus-within:ring-2 focus-within:ring-primary/40 transition">
              <AutoExpandInput
                value={formatAssertionReason(q.question_text)}
                onChange={(e) =>
                  updateQuestion(qIndex, "question_text", e.target.value)
                }
                placeholder="Enter your question..."
                className="text-base"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {q.options.map((opt, oIndex) => (
                <div
                  key={oIndex}
                  onClick={() => setCorrectOption(qIndex, oIndex)}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                    q.correct_option_index === oIndex
                      ? "border-accent bg-accent/10 ring-1 ring-accent"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      q.correct_option_index === oIndex
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {["A", "B", "C", "D"][oIndex]}
                  </span>

                  <AutoExpandInput
                    value={opt}
                    onChange={(e) =>
                      updateOption(qIndex, oIndex, e.target.value)
                    }
                    onClick={(e) => e.stopPropagation()}
                    placeholder={`Option ${["A", "B", "C", "D"][oIndex]}`}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Click an option to mark it as correct
            </p>
          </div>
        ))}
      </div>

      {/* ---------------- ACTION BUTTONS ---------------- */}

      <div className="flex flex-col sm:flex-row gap-4">
        <Button variant="outline" onClick={addQuestion} className="flex-1">
          <Plus className="mr-2 h-4 w-4" />
          Add Question
        </Button>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 gradient-primary text-primary-foreground"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : isEditing ? "Update Quiz" : "Save Quiz"}
        </Button>
      </div>
    </div>
  );
}