import React, { useState, useEffect } from "react";
import { useOrbit } from "../context/OrbitContext";
import { LifeBuoy, MessageSquare, Send } from "lucide-react";

// Standalone Help Center / Support page. Previously this lived inside the
// Wallet page as a sub-tab (?tab=support); it is now its own route
// (/dashboard/support) with its own nav entry. The ticket create/list/reply
// logic is unchanged — it still uses createTicket / replyToTicket from context.
export const DashboardSupport: React.FC = () => {
  const { user, createTicket, replyToTicket, supportError, supportLoading, refreshSupport } = useOrbit();

  const [tktSubject, setTktSubject] = useState("");
  const [tktCategory, setTktCategory] = useState<"deposit" | "withdrawal" | "trading" | "general">("general");
  const [tktInitialMsg, setTktInitialMsg] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(user.tickets[0]?.id || null);
  const [tktReplyTxt, setTktReplyTxt] = useState("");

  const [busy, setBusy] = useState<"create" | "reply" | null>(null);
  const [feedback, setFeedback] = useState<{error:boolean;message:string}|null>(null);
  useEffect(() => {
    if (!user.tickets.some(ticket => ticket.id === selectedTicketId)) setSelectedTicketId(user.tickets[0]?.id || null);
  }, [user.tickets, selectedTicketId]);

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !tktSubject.trim() || !tktInitialMsg.trim()) return;
    setBusy("create"); setFeedback(null);
    try {
      const id = await createTicket(tktSubject.trim(), tktCategory, tktInitialMsg.trim());
      setTktSubject(""); setTktInitialMsg(""); setTktCategory("general");
      if (id) setSelectedTicketId(id);
      setFeedback({error:false,message:"Your support ticket was submitted."});
    } catch { setFeedback({error:true,message:"Unable to submit your ticket. Your message is saved in this form; please try again."}); }
    finally { setBusy(null); }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !selectedTicketId || !tktReplyTxt.trim()) return;
    setBusy("reply"); setFeedback(null);
    try { await replyToTicket(selectedTicketId,tktReplyTxt.trim()); setTktReplyTxt(""); setFeedback({error:false,message:"Reply sent."}); }
    catch { setFeedback({error:true,message:"Unable to send your reply. Please try again."}); }
    finally { setBusy(null); }
  };

  const activeTicketObj = user.tickets.find(t => t.id === selectedTicketId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">

      {feedback && <p role={feedback.error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${feedback.error ? "text-red-400 border-red-500/30" : "text-emerald-400 border-emerald-500/30"}`}>{feedback.message}</p>}
      {(supportError || supportLoading) && <div role={supportError ? "alert" : "status"} className="rounded-xl border border-orbit-border p-3 text-sm text-orbit-white">
        {supportError || "Loading support tickets…"}
        {supportError && <button disabled={supportLoading} onClick={() => void refreshSupport()} className="ml-3 min-h-11 px-3 text-orbit-accent">Retry loading</button>}
      </div>}
      {/* Page Header */}
      <div className="border-b border-orbit-border/50 pb-6">
        <div className="flex items-center gap-2 text-white">
          <LifeBuoy size={24} className="text-orbit-accent shrink-0" />
          <h1 className="text-2xl font-bold font-heading">Help Center</h1>
        </div>
        <p className="text-xs text-slate-300 mt-1 font-sans">
          Open a support ticket, track its status, and chat with our team in one place.
        </p>
      </div>

      <div className="bg-orbit-card border border-orbit-border rounded-2xl p-4 sm:p-6 shadow-2xl overflow-hidden font-sans">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">

          {/* Left Column: Create new ticket (col-span-5) */}
          <form onSubmit={handleCreateTicketSubmit} className="lg:col-span-5 lg:border-r border-orbit-border/40 lg:pr-6 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-orbit-accent border-b border-orbit-border/50 pb-2 font-bold">
              New Support Ticket
            </h3>

            <div className="space-y-1">
              <label htmlFor="ticket-subject" className="text-[10px] text-slate-300 uppercase font-mono font-semibold">Subject</label>
              <input
                type="text"
                required
                id="ticket-subject" value={tktSubject}
                onChange={(e) => setTktSubject(e.target.value)}
                placeholder="e.g., Deposit delay"
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg py-2 px-3 text-xs text-white focus:border-orbit-accent focus:outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-300 uppercase font-mono font-semibold">Category</label>
              <select aria-label="Ticket category"
                value={tktCategory}
                onChange={(e) => setTktCategory(e.target.value as any)}
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg py-2 px-3 text-xs text-white focus:border-orbit-accent focus:outline-none"
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="trading">Trading</option>
                <option value="general">Account</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-300 uppercase font-mono font-semibold">Message</label>
              <textarea
                required
                aria-label="Support message"
                rows={4}
                value={tktInitialMsg}
                onChange={(e) => setTktInitialMsg(e.target.value)}
                placeholder="Detail your request..."
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg py-2 px-3 text-xs text-white focus:border-orbit-accent focus:outline-none placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={busy !== null}
              className="w-full py-2.5 bg-orbit-accent text-white font-bold text-xs uppercase rounded-lg shadow-md shadow-orbit-accent/15 hover:bg-orbit-accent-hover transition-all text-center cursor-pointer"
            >
              {busy === "create" ? "Submitting…" : "Submit"}
            </button>
          </form>

          {/* Right Column: Active Interactive chat logs (col-span-7) */}
          <div className="lg:col-span-7 flex flex-col justify-between min-h-[360px]">

            {/* Ticket selector header */}
            <div className="flex bg-orbit-bg p-1.5 border border-orbit-border/70 rounded-lg justify-start gap-2 overflow-x-auto scrollbar-none">
              {user.tickets.length === 0 ? (
                <span className="text-[10px] text-slate-400 p-1 font-sans">No active support tickets.</span>
              ) : (
                user.tickets.map((tkt) => (
                  <button
                    key={tkt.id}
                    onClick={() => setSelectedTicketId(tkt.id)}
                    className={`px-3 py-1.5 rounded text-[10px] font-semibold tracking-normal shrink-0 transition-all cursor-pointer ${
                      selectedTicketId === tkt.id
                        ? "bg-orbit-card text-orbit-accent border border-orbit-border"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {tkt.subject.slice(0, 16)}...
                  </button>
                ))
              )}
            </div>

            {/* Chat log messages */}
            <div className="flex-1 overflow-y-auto my-4 p-3 bg-orbit-darkcard/50 border border-orbit-border/40 rounded-xl space-y-4">
              {activeTicketObj ? (
                activeTicketObj.messages.map((m, idx) => {
                  const isSupport = m.sender === "support";
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isSupport ? "items-start" : "items-end"}`}
                    >
                      <div className={`max-w-[85%] rounded-xl p-3 text-xs leading-normal ${
                        isSupport
                          ? "bg-orbit-bg/85 border border-orbit-border text-white rounded-tl-none"
                          : "bg-orbit-accent text-white font-medium rounded-tr-none"
                      }`}>
                        <p className="break-words">{m.text}</p>
                        <span className="block text-[8px] text-right mt-1 opacity-80">
                          {m.time}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2 py-8">
                  <MessageSquare size={24} className="text-slate-500 animate-bounce" />
                  <p className="text-xs">Select an active ticket above, or submit a new one on the left.</p>
                </div>
              )}
            </div>

            {/* Chat Reply form */}
            {activeTicketObj && (
              <form onSubmit={handleReplySubmit} className="flex gap-2">
                <input
                  type="text"
                  required
                  aria-label="Reply message" value={tktReplyTxt}
                  onChange={(e) => setTktReplyTxt(e.target.value)}
                  placeholder="Type supplementary explanations..."
                  className="min-w-0 flex-1 bg-orbit-bg border border-orbit-border focus:border-orbit-accent rounded-xl px-4 py-2 text-xs text-white focus:outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
              disabled={busy !== null}
                  className="p-2.5 rounded-xl bg-orbit-accent hover:bg-orbit-accent-hover text-white font-bold transition-all cursor-pointer shadow-sm"
                >
                  <span className="sr-only">Send reply</span><Send size={14} />
                </button>
              </form>
            )}

          </div>

        </div>
      </div>

    </div>
  );
};
