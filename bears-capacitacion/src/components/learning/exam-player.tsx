"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Send, XCircle } from "lucide-react";
import { startExam, submitExam, type ExamSubmissionResult } from "@/app/actions/exams";
import type { EmployeeExam } from "@/lib/platform/employee";

type Attempt = { attemptId: string; startedAt: string; expiresAt: string | null };

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function Question({ question, index, selectedOptionId, onSelect, prefix }: { question: EmployeeExam["questions"][number]; index: number; selectedOptionId: string | null; onSelect: (questionId: string, optionId: string) => void; prefix: string }) {
  return <fieldset className="border border-line bg-paper p-5 sm:p-6"><legend className="sr-only">Pregunta {index + 1}</legend><p className="font-tabular text-xs text-muted">PREGUNTA {String(index + 1).padStart(2, "0")}</p><p className="mt-3 text-lg font-medium leading-7">{question.prompt}</p><div className="mt-6 grid gap-3">{question.options.map((option) => { const id = `${prefix}-${question.id}-${option.id}`; return <label className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-3 text-sm transition-colors ${selectedOptionId === option.id ? "border-jade bg-[#E0F1EB]" : "hover:bg-surface"}`} htmlFor={id} key={option.id}><input id={id} name={`${prefix}-${question.id}`} type="radio" className="size-4 accent-jade" checked={selectedOptionId === option.id} onChange={() => onSelect(question.id, option.id)} /><span>{option.label}</span></label>; })}</div></fieldset>;
}

export function ExamPlayer({ exam }: { exam: EmployeeExam }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ExamSubmissionResult | null>(null);

  useEffect(() => {
    if (!attempt?.expiresAt || result) return;
    const updateClock = () => setRemaining(new Date(attempt.expiresAt!).getTime() - Date.now());
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, [attempt, result]);

  function selectAnswer(questionId: string, optionId: string) {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionId]: optionId }));
  }

  function begin() {
    setError(null);
    setPending(true);
    startTransition(async () => {
      const response = await startExam(exam.id);
      setPending(false);
      if (response.error) {
        setError(response.error);
        return;
      }
      if (!("data" in response) || !response.data) {
        setError("No pudimos iniciar la evaluación. Intentá nuevamente.");
        return;
      }
      setAttempt(response.data);
    });
  }

  function deliver() {
    if (!attempt) return;
    setPending(true);
    setError(null);
    startTransition(async () => {
      const response = await submitExam({
        attemptId: attempt.attemptId,
        examId: exam.id,
        answers: exam.questions.map((question) => ({ questionId: question.id, optionId: answers[question.id] ?? null })),
      });
      setPending(false);
      if (response.error) {
        setError(response.error);
        setConfirming(false);
        return;
      }
      if (!("data" in response) || !response.data) {
        setError("No pudimos registrar la evaluación. Intentá nuevamente.");
        setConfirming(false);
        return;
      }
      setResult(response.data);
      setConfirming(false);
    });
  }

  if (result) return <main className="min-h-screen bg-surface px-5 py-10"><section className="mx-auto max-w-2xl border border-line bg-paper p-6 sm:p-8"><div className={`grid size-12 place-items-center rounded-full ${result.passed ? "bg-[#E0F1EB] text-jade-deep" : "bg-[#FCEAE6] text-alert"}`}>{result.passed ? <CheckCircle2 className="size-6" aria-hidden="true" /> : <XCircle className="size-6" aria-hidden="true" />}</div><p className="mt-6 font-tabular text-xs text-muted">RESULTADO</p><h1 className="mt-2 text-[31px] font-medium leading-tight">{result.expired ? "Se terminó el tiempo" : result.passed ? "Aprobaste la evaluación" : "Todavía no aprobaste"}</h1><p className="mt-3 text-sm leading-6 text-muted">{result.expired ? "El intento se registró como no aprobado." : result.passed ? "Tu resultado quedó registrado en tu progreso." : `Necesitás ${result.requiredScore}% para aprobar.`}</p><div className="mt-8 grid grid-cols-2 border border-line"><div className="p-5"><p className="text-xs text-muted">Tu nota</p><p className="font-tabular mt-2 text-3xl font-medium">{result.score}%</p></div><div className="border-l border-line p-5"><p className="text-xs text-muted">Intentos restantes</p><p className="font-tabular mt-2 text-3xl font-medium">{result.attemptsRemaining ?? "Sin límite"}</p></div></div>{result.review.length ? <section className="mt-8 space-y-4"><h2 className="text-lg font-medium">Revisión</h2>{result.review.map((item, index) => { const question = exam.questions.find((candidate) => candidate.id === item.questionId); const correct = question?.options.find((option) => option.id === item.correctOptionId); const selected = question?.options.find((option) => option.id === item.selectedOptionId); return <article className="border border-line p-4" key={item.questionId}><p className="font-tabular text-xs text-muted">PREGUNTA {index + 1}</p><p className="mt-2 text-sm font-medium">{question?.prompt}</p><p className="mt-3 text-sm text-muted">Tu respuesta: {selected?.label ?? "Sin responder"}</p><p className="mt-1 text-sm text-jade-deep">Respuesta correcta: {correct?.label ?? "No disponible"}</p>{item.explanation ? <p className="mt-3 text-sm leading-6 text-muted">{item.explanation}</p> : null}</article>; })}</section> : null}<Link href="/cursos/progreso" className="mt-8 inline-flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep">Ver mi progreso <ChevronRight className="size-4" aria-hidden="true" /></Link></section></main>;

  if (!attempt) return <main className="grid min-h-screen place-items-center bg-surface px-5 py-10"><section className="w-full max-w-xl border border-line bg-paper p-6 sm:p-8"><Link href="/cursos/mis-cursos" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />Volver a mis cursos</Link><p className="mt-8 font-tabular text-xs text-jade-deep">EVALUACIÓN</p><h1 className="mt-3 text-[31px] font-medium leading-tight">{exam.title}</h1>{exam.description ? <p className="mt-3 text-sm leading-6 text-muted">{exam.description}</p> : null}<dl className="mt-8 grid grid-cols-2 border border-line text-sm"><div className="p-4"><dt className="text-muted">Aprobación</dt><dd className="font-tabular mt-2 text-xl font-medium">{exam.passing_score}%</dd></div><div className="border-l border-line p-4"><dt className="text-muted">Tiempo</dt><dd className="font-tabular mt-2 text-xl font-medium">{exam.time_limit_minutes ? `${exam.time_limit_minutes} min` : "Sin límite"}</dd></div></dl>{error ? <p className="mt-5 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{error}</p> : null}<button className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep disabled:opacity-60" type="button" onClick={begin} disabled={pending || !exam.questions.length}>{pending ? "Preparando" : "Comenzar evaluación"}</button>{!exam.questions.length ? <p className="mt-3 text-sm text-muted">Esta evaluación todavía no tiene preguntas publicadas.</p> : null}</section></main>;

  const answered = Object.keys(answers).length;
  const currentQuestion = exam.questions[activeQuestion];
  return <main className="min-h-screen bg-surface px-5 py-6 sm:px-8 sm:py-10"><section className="mx-auto max-w-4xl"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-tabular text-xs text-jade-deep">EVALUACIÓN</p><h1 className="mt-2 text-2xl font-medium sm:text-[31px]">{exam.title}</h1></div>{remaining !== null ? <span className={`font-tabular inline-flex h-11 items-center gap-2 border px-3 text-sm ${remaining <= 60_000 ? "border-alert text-alert" : "border-line text-muted"}`}><Clock3 className="size-4" aria-hidden="true" />{formatRemaining(remaining)}</span> : null}</header><div className="mt-6 h-1.5 overflow-hidden bg-line"><div className="h-full bg-jade transition-[width]" style={{ width: `${(answered / exam.questions.length) * 100}%` }} /></div><p className="mt-3 text-sm text-muted">{answered} de {exam.questions.length} respondidas</p><div className="mt-8 md:hidden"><Question question={currentQuestion} index={activeQuestion} selectedOptionId={answers[currentQuestion.id] ?? null} onSelect={selectAnswer} prefix="mobile" /><div className="mt-5 flex justify-between gap-3"><button className="flex h-11 items-center gap-2 rounded-sm border px-4 text-sm disabled:opacity-40" type="button" onClick={() => setActiveQuestion((index) => Math.max(0, index - 1))} disabled={activeQuestion === 0}><ChevronLeft className="size-4" aria-hidden="true" />Anterior</button>{activeQuestion < exam.questions.length - 1 ? <button className="ml-auto flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white" type="button" onClick={() => setActiveQuestion((index) => Math.min(exam.questions.length - 1, index + 1))}>Siguiente<ChevronRight className="size-4" aria-hidden="true" /></button> : <button className="ml-auto flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white" type="button" onClick={() => setConfirming(true)}>Entregar<Send className="size-4" aria-hidden="true" /></button>}</div></div><div className="mt-8 hidden space-y-5 md:block">{exam.questions.map((question, index) => <Question question={question} index={index} selectedOptionId={answers[question.id] ?? null} onSelect={selectAnswer} prefix="desktop" key={question.id} />)}</div><div className="mt-8 hidden justify-end md:flex"><button className="flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" type="button" onClick={() => setConfirming(true)}>Entregar evaluación <Send className="size-4" aria-hidden="true" /></button></div>{confirming ? <section className="mt-6 border border-jade bg-[#E0F1EB] p-5" role="dialog" aria-label="Confirmar entrega"><h2 className="font-medium">¿Querés entregar la evaluación?</h2><p className="mt-2 text-sm text-muted">Se registrarán {answered} de {exam.questions.length} respuestas. No vas a poder editar este intento después de entregarlo.</p>{error ? <p className="mt-3 text-sm text-alert" role="alert">{error}</p> : null}<div className="mt-5 flex flex-wrap gap-3"><button className="h-11 rounded-sm border border-jade bg-paper px-4 text-sm" type="button" onClick={() => setConfirming(false)} disabled={pending}>Seguir respondiendo</button><button className="flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60" type="button" onClick={deliver} disabled={pending}>{pending ? "Entregando" : "Confirmar entrega"}<Send className="size-4" aria-hidden="true" /></button></div></section> : null}</section></main>;
}