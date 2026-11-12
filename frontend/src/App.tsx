import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clipboard,
  CloudUpload,
  FileCheck2,
  FileText,
  Files,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Ship,
  X,
} from "lucide-react";
import { apiRequest } from "./api";
import type { AnswerResult, ClaimDraft, DocumentRecord, SourcePassage, User } from "./types";

const TerminalScene = lazy(() => import("./components/TerminalScene"));

type View = "overview" | "documents" | "ask" | "claims";
type AuthMode = "signin" | "register";
type Notice = { message: string; tone: "error" | "success" } | null;

const tokenStorageKey = "freight-copilot-token";
const userStorageKey = "freight-copilot-user";
const maxUploadBytes = 10 * 1024 * 1024;
const viewLabels: Record<View, string> = {
  overview: "Overview",
  documents: "Documents",
  ask: "Contract Q&A",
  claims: "Claim drafts",
};

function readUser(): User | null {
  try {
    return JSON.parse(sessionStorage.getItem(userStorageKey) || "null") as User | null;
  } catch {
    sessionStorage.removeItem(userStorageKey);
    return null;
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function fullName(user: User) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenStorageKey));
  const [user, setUser] = useState<User | null>(readUser);
  const [activeView, setActiveView] = useState<View>("overview");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authNotice, setAuthNotice] = useState<Notice>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentsBusy, setDocumentsBusy] = useState(false);
  const [documentNotice, setDocumentNotice] = useState<Notice>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [questionNotice, setQuestionNotice] = useState<Notice>(null);
  const [questionBusy, setQuestionBusy] = useState(false);
  const [claimDraft, setClaimDraft] = useState<ClaimDraft | null>(null);
  const [claimNotice, setClaimNotice] = useState<Notice>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    apiRequest<User>("/auth/me/", { token })
      .then((currentUser) => {
        setUser(currentUser);
        sessionStorage.setItem(userStorageKey, JSON.stringify(currentUser));
      })
      .catch(() => {
        sessionStorage.removeItem(tokenStorageKey);
        sessionStorage.removeItem(userStorageKey);
        setToken(null);
        setUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    apiRequest<DocumentRecord[]>("/documents/", { token })
      .then((items) => {
        if (active) setDocuments(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (active) setDocuments([]);
      });
    fetch(`${(import.meta.env.VITE_API_BASE_URL || document.querySelector<HTMLMetaElement>('meta[name="api-base"]')?.content || "/api").replace(/\/+$/, "")}/health/`)
      .then((response) => setApiOnline(response.ok))
      .catch(() => setApiOnline(false));
    return () => { active = false; };
  }, [token]);

  async function refreshDocuments() {
    if (!token) return;
    setDocumentsBusy(true);
    try {
      const items = await apiRequest<DocumentRecord[]>("/documents/", { token });
      setDocuments(Array.isArray(items) ? items : []);
      setDocumentNotice(null);
    } catch (error) {
      setDocumentNotice({ message: error instanceof Error ? error.message : "Could not load documents.", tone: "error" });
    } finally {
      setDocumentsBusy(false);
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthNotice(null);
    const values = new FormData(event.currentTarget);
    const payload: Record<string, string> = {
      email: String(values.get("email") || "").trim(),
      password: String(values.get("password") || ""),
    };
    if (authMode === "register") {
      payload.first_name = String(values.get("first_name") || "").trim();
      payload.last_name = String(values.get("last_name") || "").trim();
      payload.company_name = String(values.get("company_name") || "").trim();
    }
    try {
      const result = await apiRequest<{ token: string; user: User }>(
        authMode === "register" ? "/auth/register/" : "/auth/login/",
        { method: "POST", body: payload },
      );
      sessionStorage.setItem(tokenStorageKey, result.token);
      sessionStorage.setItem(userStorageKey, JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setActiveView("overview");
      setDocuments([]);
    } catch (error) {
      setAuthNotice({ message: error instanceof Error ? error.message : "Could not sign in.", tone: "error" });
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem(tokenStorageKey);
    sessionStorage.removeItem(userStorageKey);
    setToken(null);
    setUser(null);
    setDocuments([]);
    setAnswer(null);
    setClaimDraft(null);
    setAuthMode("signin");
  }

  function navigate(view: View) {
    setActiveView(view);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "documents") void refreshDocuments();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    setDocumentNotice(null);
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      setSelectedFile(null);
      setDocumentNotice({ message: "Choose a PDF document.", tone: "error" });
      return;
    }
    if (file.size > maxUploadBytes) {
      setSelectedFile(null);
      setDocumentNotice({ message: "The file is larger than the 10 MB limit.", tone: "error" });
      return;
    }
    setSelectedFile(file);
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedFile) return;
    setUploadBusy(true);
    setDocumentNotice(null);
    const body = new FormData();
    body.append("file", selectedFile);
    try {
      await apiRequest<DocumentRecord>("/documents/", { method: "POST", token, body });
      setDocumentNotice({ message: "PDF received. Processing will appear in the library shortly.", tone: "success" });
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await refreshDocuments();
    } catch (error) {
      setDocumentNotice({ message: error instanceof Error ? error.message : "Upload failed.", tone: "error" });
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !question.trim()) return;
    setQuestionBusy(true);
    setQuestionNotice(null);
    setAnswer(null);
    try {
      const result = await apiRequest<AnswerResult>("/rag/answer/", {
        method: "POST",
        token,
        body: { question: question.trim() },
      });
      setAnswer(result);
    } catch (error) {
      setQuestionNotice({ message: error instanceof Error ? error.message : "Search failed.", tone: "error" });
    } finally {
      setQuestionBusy(false);
    }
  }

  async function handleClaimSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setClaimBusy(true);
    setClaimNotice(null);
    const values = new FormData(event.currentTarget);
    const payload = {
      shipment_id: String(values.get("shipment_id") || "").trim(),
      subject: String(values.get("subject") || "").trim(),
      issue: String(values.get("issue") || "").trim(),
    };
    try {
      const draft = await apiRequest<ClaimDraft>("/claims/", { method: "POST", token, body: payload });
      setClaimDraft(draft);
      setClaimNotice({ message: "Draft saved to your workspace.", tone: "success" });
    } catch (error) {
      setClaimNotice({ message: error instanceof Error ? error.message : "Could not create the claim draft.", tone: "error" });
    } finally {
      setClaimBusy(false);
    }
  }

  async function copyDraft() {
    if (!claimDraft) return;
    try {
      await navigator.clipboard.writeText(claimDraft.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setClaimNotice({ message: "Clipboard access is unavailable in this browser.", tone: "error" });
    }
  }

  if (!token || !user) {
    return (
      <AuthScreen
        mode={authMode}
        busy={authBusy}
        notice={authNotice}
        onModeChange={(mode) => { setAuthMode(mode); setAuthNotice(null); }}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  const readyCount = documents.filter((document) => document.status === "ready").length;
  const processingCount = documents.filter((document) => document.status === "processing" || document.status === "uploaded").length;

  return (
    <div className="workspace">
      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`}>
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); navigate("overview"); }}>
          <span className="brand-symbol"><Ship size={19} strokeWidth={2.2} /></span>
          <span className="brand-name">FREIGHT<span> COPILOT</span></span>
        </a>
        <div className="workspace-picker">
          <span className="company-mark">{(user.company_name || "F").slice(0, 1).toUpperCase()}</span>
          <span className="company-copy"><strong>{user.company_name || "My workspace"}</strong><small>Operations team</small></span>
          <ChevronDown size={15} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Workspace navigation">
          <NavButton view="overview" activeView={activeView} onClick={navigate} icon={<LayoutDashboard size={17} />}>Overview</NavButton>
          <NavButton view="documents" activeView={activeView} onClick={navigate} icon={<Files size={17} />} count={documents.length}>Documents</NavButton>
          <NavButton view="ask" activeView={activeView} onClick={navigate} icon={<MessageSquareText size={17} />}>Contract Q&amp;A</NavButton>
          <NavButton view="claims" activeView={activeView} onClick={navigate} icon={<FileCheck2 size={17} />}>Claim drafts</NavButton>
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-state"><span className={`connection-lamp${apiOnline ? " is-online" : apiOnline === false ? " is-offline" : ""}`} />{apiOnline ? "API connected" : apiOnline === false ? "API unavailable" : "Checking API"}</div>
          <div className="profile-row">
            <span className="profile-avatar">{fullName(user).slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{fullName(user)}</strong><small>{user.role}</small></span>
            <button className="icon-button signout" type="button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{viewLabels[activeView]}</strong></div>
          <div className="topbar-actions"><span className="today-date">{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span><button className="mobile-nav-toggle" type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button></div>
        </header>

        <div className="page-content">
          {activeView === "overview" && (
            <OverviewPage
              user={user}
              documents={documents}
              readyCount={readyCount}
              processingCount={processingCount}
              onNavigate={navigate}
            />
          )}
          {activeView === "documents" && (
            <DocumentsPage
              documents={documents}
              selectedFile={selectedFile}
              fileInput={fileInput}
              busy={uploadBusy}
              loading={documentsBusy}
              notice={documentNotice}
              onFile={pickFile}
              onSubmit={handleUpload}
              onRefresh={refreshDocuments}
            />
          )}
          {activeView === "ask" && (
            <AskPage
              question={question}
              answer={answer}
              notice={questionNotice}
              busy={questionBusy}
              onQuestionChange={setQuestion}
              onSubmit={handleQuestion}
            />
          )}
          {activeView === "claims" && (
            <ClaimsPage
              draft={claimDraft}
              notice={claimNotice}
              busy={claimBusy}
              copied={copied}
              onSubmit={handleClaimSubmit}
              onCopy={copyDraft}
            />
          )}
        </div>
        <footer className="app-footer"><span>FREIGHT COPILOT / OPERATIONS</span><span>COMPANY-SCOPED WORKSPACE</span></footer>
      </main>
    </div>
  );
}

function AuthScreen({
  mode,
  busy,
  notice,
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode;
  busy: boolean;
  notice: Notice;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-intro">
        <Suspense fallback={<div className="auth-scene-placeholder" />}><TerminalScene variant="auth" /></Suspense>
        <div className="auth-scene-shade" />
        <a className="brand brand-inverted" href="#top"><span className="brand-symbol"><Ship size={19} /></span><span className="brand-name">FREIGHT<span> COPILOT</span></span></a>
        <div className="auth-intro-copy"><p className="overline">FREIGHT / CONTRACTS / CLAIMS</p><h1>Keep the<br />details moving.</h1><p>One clear workspace for shipment records, contract answers, and claim drafts.</p></div>
        <div className="auth-terminal-stamp"><span><Gauge size={16} /> OPERATIONS DESK</span><strong>01 <i /> 04</strong></div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="overline">{mode === "register" ? "NEW COMPANY WORKSPACE" : "YOUR OPERATIONS WORKSPACE"}</p>
          <h2>{mode === "register" ? "Set up your desk" : "Welcome back"}</h2>
          <p className="auth-subtitle">{mode === "register" ? "Create an owner account for your company." : "Sign in to continue to your workspace."}</p>
          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "is-active" : ""} onClick={() => onModeChange("signin")}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-active" : ""} onClick={() => onModeChange("register")}>Create workspace</button>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            {mode === "register" && <div className="input-pair"><label className="field"><span>First name</span><input name="first_name" autoComplete="given-name" /></label><label className="field"><span>Last name</span><input name="last_name" autoComplete="family-name" /></label></div>}
            {mode === "register" && <label className="field"><span>Company name</span><input name="company_name" autoComplete="organization" required maxLength={255} /></label>}
            <label className="field"><span>Work email</span><input name="email" type="email" autoComplete="username" required /></label>
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={8} /></label>
            {notice && <p className={`inline-notice ${notice.tone}`} role="alert">{notice.message}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>{mode === "register" ? "Create workspace" : "Sign in"}<ArrowRight size={17} /></>}</button>
          </form>
          <p className="auth-footnote"><ShieldCheck size={15} /> Company-scoped access for freight operations.</p>
        </div>
        <div className="auth-copyright"><span>FREIGHT COPILOT</span><span>CONTRACTS / CLAIMS / CONTROL</span></div>
      </section>
    </main>
  );
}

function NavButton({
  view,
  activeView,
  onClick,
  icon,
  count,
  children,
}: {
  view: View;
  activeView: View;
  onClick: (view: View) => void;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return <button type="button" className={`nav-link${activeView === view ? " is-active" : ""}`} aria-current={activeView === view ? "page" : undefined} onClick={() => onClick(view)}>{icon}<span>{children}</span>{count !== undefined && <span className="nav-count">{count}</span>}</button>;
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="overline">{eyebrow}</p><h1>{title}</h1><p className="page-description">{detail}</p></div>{action}</div>;
}

function OverviewPage({
  user,
  documents,
  readyCount,
  processingCount,
  onNavigate,
}: {
  user: User;
  documents: DocumentRecord[];
  readyCount: number;
  processingCount: number;
  onNavigate: (view: View) => void;
}) {
  const recent = documents.slice(0, 4);
  return (
    <section className="overview-page">
      <div className="overview-hero">
        <Suspense fallback={<div className="terminal-scene scene-loading" />}><TerminalScene /></Suspense>
        <div className="hero-shade" />
        <div className="hero-copy"><p className="hero-kicker"><span className="live-dot" /> FREIGHT OPERATIONS / {user.company_name || "WORKSPACE"}</p><h1>Every move,<br /><span>in perspective.</span></h1><p>Documents, terms, and claims in one working view.</p><button className="hero-button" type="button" onClick={() => onNavigate("documents")}>Open document library <ArrowUpRight size={16} /></button></div>
        <div className="hero-index"><span>LIVE VIEW</span><strong>01 <i /> 04</strong></div>
      </div>
      <div className="overview-main">
        <div className="metric-row" aria-label="Document summary">
          <Metric label="DOCUMENTS" value={documents.length} note="In this workspace" icon={<Files size={17} />} />
          <Metric label="READY TO SEARCH" value={readyCount} note="Text indexed" icon={<Search size={17} />} />
          <Metric label="PROCESSING" value={processingCount} note="In the intake queue" icon={<RefreshCw size={17} />} />
          <div className="metric-action"><span className="metric-action-symbol"><Plus size={19} /></span><span><strong>Keep the record complete</strong><small>Upload a contract or shipment PDF</small></span><button type="button" aria-label="Upload a document" onClick={() => onNavigate("documents")}><ArrowRight size={17} /></button></div>
        </div>
        <div className="overview-lower">
          <section className="recent-section">
            <div className="section-title"><div><p className="overline">LATEST INTAKE</p><h2>Recent documents</h2></div><button className="text-action" type="button" onClick={() => onNavigate("documents")}>All documents <ArrowRight size={15} /></button></div>
            {recent.length ? <div className="recent-list">{recent.map((document) => <DocumentRow key={document.id} document={document} compact />)}</div> : <EmptyState icon={<Files size={20} />} title="Nothing on the desk yet" detail="Upload a selectable-text PDF to start building your company library." action={<button className="text-action" type="button" onClick={() => onNavigate("documents")}>Add a document <ArrowRight size={15} /></button>} />}
          </section>
          <aside className="quick-actions">
            <div className="section-title"><div><p className="overline">QUICK ACCESS</p><h2>Choose a task</h2></div></div>
            <button type="button" className="quick-action" onClick={() => onNavigate("ask")}><span className="quick-icon"><MessageSquareText size={18} /></span><span><strong>Ask a contract</strong><small>Search indexed terms</small></span><ArrowUpRight size={16} /></button>
            <button type="button" className="quick-action" onClick={() => onNavigate("claims")}><span className="quick-icon quick-icon-warm"><FileCheck2 size={18} /></span><span><strong>Draft a claim</strong><small>Prepare a reviewable letter</small></span><ArrowUpRight size={16} /></button>
            <p className="grounded-note"><CircleHelp size={15} /> Contract answers include matching source passages.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: number; note: string; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span>{icon}</div><strong>{String(value).padStart(2, "0")}</strong><small>{note}</small></div>;
}

function DocumentsPage({
  documents,
  selectedFile,
  fileInput,
  busy,
  loading,
  notice,
  onFile,
  onSubmit,
  onRefresh,
}: {
  documents: DocumentRecord[];
  selectedFile: File | null;
  fileInput: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  loading: boolean;
  notice: Notice;
  onFile: (file: File | undefined) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <section>
      <PageHeading eyebrow="WORKSPACE / FILES" title="Document library" detail="Company PDFs available for retrieval and reference." action={<span className="format-note"><FileText size={16} /> PDF / MAX 10 MB</span>} />
      <form className={`upload-zone${dragging ? " is-dragging" : ""}`} onSubmit={onSubmit} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); }}>
        <input ref={fileInput} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => onFile(event.currentTarget.files?.[0])} />
        <span className="upload-icon"><CloudUpload size={23} /></span>
        <div className="upload-copy"><strong>{selectedFile ? selectedFile.name : "Drop a PDF here"}</strong><span>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to upload` : "Selectable-text PDF · 10 MB maximum"}</span></div>
        <div className="upload-actions"><button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}><ArrowDownToLine size={16} /> Choose PDF</button><button className="primary-button" type="submit" disabled={!selectedFile || busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>Upload file <ArrowUpRight size={16} /></>}</button></div>
      </form>
      {notice && <NoticeLine notice={notice} />}
      <section className="document-library">
        <div className="section-title"><div><p className="overline">COMPANY FILES</p><h2>All documents <span className="count-badge">{documents.length}</span></h2></div><button className="icon-button light-icon" type="button" onClick={onRefresh} disabled={loading} title="Refresh library" aria-label="Refresh library"><RefreshCw className={loading ? "spin" : ""} size={17} /></button></div>
        {documents.length ? <div className="table-scroll"><table className="documents-table"><thead><tr><th>FILE</th><th>TYPE</th><th>STATUS</th><th>UPLOADED</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><DocumentRow document={document} /></td><td><span className="type-label">{document.document_type.replaceAll("_", " ")}</span></td><td><StatusBadge status={document.status} /></td><td className="date-cell">{formatDate(document.uploaded_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={loading ? <LoaderCircle className="spin" size={20} /> : <Files size={20} />} title={loading ? "Loading company files" : "Your library is empty"} detail={loading ? "Checking the workspace for uploaded PDFs." : "Uploaded PDFs appear here after they are received."} />}
      </section>
    </section>
  );
}

function DocumentRow({ document, compact = false }: { document: DocumentRecord; compact?: boolean }) {
  return <div className={`document-row${compact ? " is-compact" : ""}`}><span className="pdf-mark">PDF</span><span className="document-copy"><strong>{document.name}</strong><small>{formatDate(document.uploaded_at)}</small></span>{compact && <StatusBadge status={document.status} />}</div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}><i />{status.replaceAll("_", " ")}</span>;
}

function AskPage({
  question,
  answer,
  notice,
  busy,
  onQuestionChange,
  onSubmit,
}: {
  question: string;
  answer: AnswerResult | null;
  notice: Notice;
  busy: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section>
      <PageHeading eyebrow="WORKSPACE / RETRIEVAL" title="Contract Q&A" detail="Find a term, then inspect the passage it came from." action={<span className="scope-pill"><span /> COMPANY DOCUMENTS</span>} />
      <div className="ask-layout">
        <section className="ask-workspace">
          <form className="question-box" onSubmit={onSubmit}>
            <label className="field"><span>What do you need to find?</span><textarea value={question} onChange={(event) => onQuestionChange(event.target.value)} rows={3} maxLength={1000} placeholder="For example: What is the late delivery penalty?" required /></label>
            <div className="question-controls"><span>Searches only documents marked ready.</span><button className="primary-button" type="submit" disabled={busy || !question.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <>Search documents <Search size={16} /></>}</button></div>
          </form>
          {notice && <NoticeLine notice={notice} />}
          {busy && <div className="answer-loading"><LoaderCircle className="spin" size={19} /> Searching company documents…</div>}
          {answer ? <AnswerPanel answer={answer} /> : !busy && <EmptyState icon={<Search size={21} />} title="Ask a question to begin" detail="Matching passages and document references will appear here." />}
        </section>
        <aside className="method-panel"><span className="method-mark"><Search size={18} /></span><p className="overline">HOW THIS SEARCH WORKS</p><h2>Evidence first.</h2><p>The current search matches keywords in indexed PDF text and returns source passages. Answers are extractive, not generated by an external AI model.</p><div className="method-divider" /><span className="method-meta"><ShieldCheck size={15} /> COMPANY-SCOPED RESULTS</span></aside>
      </div>
    </section>
  );
}

function AnswerPanel({ answer }: { answer: AnswerResult }) {
  return <section className="answer-panel"><div className="answer-title"><span><Check size={17} /></span><div><p className="overline">RETRIEVAL RESULT</p><h2>Answer</h2></div></div><p className="answer-copy">{answer.answer}</p><div className="source-divider"><span>SOURCE PASSAGES</span><span>{answer.sources.length} {answer.sources.length === 1 ? "source" : "sources"}</span></div>{answer.sources.length ? <div className="source-list">{answer.sources.map((source, index) => <SourceCard key={`${source.document_name}-${source.chunk_index}-${index}`} source={source} />)}</div> : <p className="no-sources">No matching passages were returned.</p>}</section>;
}

function SourceCard({ source }: { source: SourcePassage }) {
  return <article className="source-card"><div><strong>{source.document_name}</strong><span>PAGE {source.page_number} / PASSAGE {source.chunk_index + 1}</span></div><p>{source.text}</p></article>;
}

function ClaimsPage({
  draft,
  notice,
  busy,
  copied,
  onSubmit,
  onCopy,
}: {
  draft: ClaimDraft | null;
  notice: Notice;
  busy: boolean;
  copied: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
}) {
  return (
    <section>
      <PageHeading eyebrow="WORKSPACE / CLAIMS" title="Claim draft studio" detail="Turn shipment facts into a structured letter for internal review." action={<span className="draft-pill"><span /> DRAFT ONLY</span>} />
      <div className="claims-layout">
        <section className="claim-form-panel">
          <div className="section-title"><div><p className="overline">NEW CLAIM</p><h2>Shipment details</h2></div><span className="step-label">01 / 01</span></div>
          <form className="claim-form" onSubmit={onSubmit}>
            <div className="input-pair"><label className="field"><span>Shipment / LR number</span><input name="shipment_id" maxLength={120} required placeholder="LR-20481" /></label><label className="field"><span>Claim subject</span><input name="subject" maxLength={255} required placeholder="Late delivery claim" /></label></div>
            <label className="field"><span>What happened?</span><textarea name="issue" rows={6} required placeholder="Describe the issue, timeline, and relevant shipment facts." /></label>
            {notice && <NoticeLine notice={notice} />}
            <div className="claim-controls"><span>Review the saved draft before sharing externally.</span><button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>Generate draft <ArrowRight size={16} /></>}</button></div>
          </form>
        </section>
        <section className="draft-preview" aria-live="polite">
          <div className="section-title"><div><p className="overline">DRAFT PREVIEW</p><h2>{draft?.subject || "Preview"}</h2></div>{draft && <button className="icon-button light-icon" type="button" onClick={onCopy} title="Copy draft" aria-label="Copy draft">{copied ? <CheckCircle2 size={17} /> : <Clipboard size={17} />}</button>}</div>
          {draft ? <><div className="draft-metadata"><span>SHIPMENT {draft.shipment_id}</span><span>CREATED {formatDate(draft.created_at)}</span></div><pre className="draft-body">{draft.body}</pre><div className="draft-saved"><CheckCircle2 size={15} /> Saved to your company workspace as a draft.</div></> : <div className="draft-empty"><div className="draft-paper"><span /><span /><span /><span /><span /></div><p>Your generated letter will appear here for review.</p></div>}
        </section>
      </div>
    </section>
  );
}

function EmptyState({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <p className={`inline-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.tone === "success" ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}{notice.message}</p>;
}

export default App;