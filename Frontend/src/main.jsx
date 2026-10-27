import React, { createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  useNavigate,
  NavLink,
  Outlet,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';
import './styles.css';
import {
  FaceLandmarker,
  FilesetResolver
} from '@mediapipe/tasks-vision';


/* =========================================================
   AUTHENTICATION
========================================================= */

const Auth = createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pp_user'));
    } catch {
      return null;
    }
  });

  const login = async (email, password) => {
    const r = await fetch(
      (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api') +
        '/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error(d.detail || 'Login failed');
    }

    localStorage.setItem('pp_token', d.token);
    localStorage.setItem('pp_user', JSON.stringify(d.user));

    setUser(d.user);
  };

  const signup = async (name, email, password) => {
    const r = await fetch(
      (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api') +
        '/auth/register',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          password
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error(d.detail || 'Registration failed');
    }

    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');

    setUser(null);

    return d;
  };

  const logout = () => {
    const currentUser = user;
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');
    localStorage.removeItem(`pp_session_${currentUser?.id || 'guest'}`);

    setUser(null);
  };

  const updateUser = (updated) => {
    const nextUser = { ...user, ...updated };
    localStorage.setItem('pp_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  return (
    <Auth.Provider
      value={{
        user,
        login,
        signup,
        logout,
        updateUser
      }}
    >
      {children}
    </Auth.Provider>
  );
}

const useAuth = () => useContext(Auth);


/* =========================================================
   ICON COMPONENT
========================================================= */

function Icon({ n, s = 18 }) {
  const p = {
    width: s,
    height: s,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  const d = {
    dash: (
      <>
        <rect x="4" y="4" width="6" height="7" rx="1" />
        <rect x="14" y="4" width="6" height="4" rx="1" />
        <rect x="14" y="12" width="6" height="8" rx="1" />
        <rect x="4" y="15" width="6" height="5" rx="1" />
      </>
    ),

    video: (
      <>
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="m17 10 4-2v8l-4-2z" />
      </>
    ),

    file: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5M9 13h6M9 17h5" />
      </>
    ),

    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.7-3.1 3.1-5 7-5s6.3 1.9 7 5" />
      </>
    ),

    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),

    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),

    play: <path d="m9 6 9 6-9 6z" />,

    arrow: (
      <>
        <path d="M5 12h13" />
        <path d="M14 7l5 5-5 5" />
      </>
    ),

    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M5 20h14" />
      </>
    ),

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),

    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),

    download: (
      <>
        <path d="M12 4v11m-5-4 5 5 5-5M5 20h14" />
      </>
    ),

    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />
    )
  };

  return <svg {...p}>{d[n]}</svg>;
}


/* =========================================================
   API HELPER
========================================================= */

const API = () =>
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('pp_token');

  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : {
          'Content-Type': 'application/json'
        }),
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const r = await fetch(API() + path, {
    ...options,
    headers
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(
      d.detail ||
        d.message ||
        'Request failed'
    );
  }

  return d;
}


/* =========================================================
   MAIN SHELL
========================================================= */

function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [open, setOpen] = useState(false);

  const initials = (user?.name || 'C')
    .split(' ')
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setSearchLoading(true);
    api('/reports/history')
      .then((d) => {
        if (!cancelled) {
          setHistoryItems(d.all || d.recent || []);
          setHistoryLoaded(true);
        }
      })
      .catch(() => { if (!cancelled) setHistoryLoaded(true); })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const query = searchQuery.trim().toLowerCase();
  const filteredHistory = query
    ? historyItems.filter((item) => {
        const haystack = [
          item.domain,
          item.domain.replaceAll('-', ' '),
          item.difficulty,
          item.difficulty && item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1),
          item.score != null ? String(item.score) : '',
          item.questionCount != null ? String(item.questionCount) : '',
          item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '',
          item.completedAt ? new Date(item.completedAt).toISOString().slice(0, 10) : ''
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
    : historyItems;

  return (
    <div className="app">

      <aside className={open ? 'sidebar open' : 'sidebar'}>

        <div className="brand">
          <span className="mark">P</span>

          <span>
            <b>PrepPilot</b>
            <small>AI interview workspace</small>
          </span>
        </div>

        <div className="label">
          WORKSPACE
        </div>

        <nav>

          {[
            ['dash', 'Dashboard', '/dashboard'],
            ['video', 'Interview Setup', '/interview-setup'],
            ['star', 'Practice Mode', '/practice'],
            ['file', 'Reports', '/report'],
            ['user', 'Profile', '/profile'],
            ['check', 'Privacy', '/privacy']
          ].map(([i, t, to]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                isActive ? 'nav active' : 'nav'
              }
            >
              <Icon n={i} />
              {t}
            </NavLink>
          ))}

        </nav>

        <div className="side-cta">

          <b>Ready to practice?</b>

          <p>
            Start a new adaptive mock interview
            and keep building your skills.
          </p>

          <button
            onClick={() => nav('/interview-setup')}
          >
            Start interview
            <Icon n="arrow" s={14} />
          </button>

        </div>

      </aside>

      {open && (
        <button
          className="backdrop"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="main">

        <header>

          <button
            className="hamb"
            onClick={() => setOpen(true)}
          >
            <Icon n="menu" />
          </button>

          <div className="mobile-brand">
            <span className="mark small">P</span>
            <b>PrepPilot</b>
          </div>

          <div className="search">
            <Icon n="search" s={17} />
            <input
              placeholder="Search your interviews"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                style={{ border: 0, background: 'none', cursor: 'pointer', color: '#8da0b8' }}
                onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
              >
                ×
              </button>
            )}
            {searchOpen && searchQuery && (
              <div className="search-results">
                {searchLoading && <p>Searching your interviews…</p>}
                {!searchLoading && filteredHistory.length === 0 && historyLoaded && <p>No matching interviews found</p>}
                {!searchLoading && historyLoaded && historyItems.length === 0 && (
                  <p>You have no interview history yet.</p>
                )}
                {filteredHistory.map((item) => (
                  <button
                    key={item.sessionId}
                    type="button"
                    className="search-result"
                    onClick={() => {
                      setSearchOpen(false);
                      nav(`/report?sessionId=${item.sessionId}`);
                    }}
                  >
                    <b>{item.domain.replaceAll('-', ' ')}</b>
                    <small>{new Date(item.completedAt).toLocaleDateString()} · {item.difficulty} · {item.questionCount ?? '?'} questions · {item.score}/100</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="bell">
            <Icon n="bell" s={18} />
            <i />
          </button>

          <button
            className="profile-trigger"
            onClick={() => nav('/profile')}
          >
            <span className="avatar">
              {initials}
            </span>

            <span>
              <b>{user?.name || 'Candidate'}</b>
              <small>
                {user?.role || 'Interview Candidate'}
              </small>
            </span>
          </button>

          <button
            className="signout"
            onClick={() => {
              logout();
              nav('/login');
            }}
          >
            Sign out
          </button>

        </header>

        <main>
          <Outlet />
        </main>

      </div>
    </div>
  );
}


/* =========================================================
   PROTECTED ROUTES
========================================================= */

function Protected() {
  return useAuth().user ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      replace
    />
  );
}


/* =========================================================
   AUTH LAYOUT
========================================================= */

function AuthLayout({
  children,
  signup = false
}) {
  return (
    <div className="auth">

      <section className="auth-left">

        <div className="brand">
          <span className="mark">P</span>
          <b>PrepPilot</b>
        </div>

        <div className="auth-copy">

          <span className="eyebrow">
            AI-POWERED INTERVIEW PREPARATION
          </span>

          <h1>
            {signup
              ? 'Your next interview starts with practice.'
              : 'Practice the interview, not just the answers.'}
          </h1>

          <p>
            Adaptive mock interviews, real-time coaching
            and actionable feedback — designed to make
            your next interview stronger.
          </p>

          <div className="auth-features">

            <div>
              <b>01</b>
              <span>Adaptive questions</span>
            </div>

            <div>
              <b>02</b>
              <span>Real-time coaching</span>
            </div>

            <div>
              <b>03</b>
              <span>Performance reports</span>
            </div>

          </div>

        </div>

      </section>

      <section className="auth-right">

        <div className="auth-card">

          <div className="auth-logo">
            <span className="mark small">P</span>
            <b>PrepPilot</b>
          </div>

          {children}

        </div>

      </section>

    </div>
  );
}


/* =========================================================
   LOGIN
========================================================= */

function Login() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');

  const [notice, setNotice] = useState(
    () =>
      sessionStorage.getItem('pp_notice') || ''
  );

  React.useEffect(() => {
    sessionStorage.removeItem('pp_notice');
  }, []);

  return (
    <AuthLayout>

      <span className="eyebrow">
        WELCOME BACK
      </span>

      <h2>
        Log in to your workspace
      </h2>

      <p className="auth-sub">
        Continue building interview confidence.
      </p>

      {notice && (
        <div className="success">
          {notice}
        </div>
      )}

      {err && (
        <div className="error">
          {err}
        </div>
      )}

      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();

          setErr('');

          try {
            await login(email, pass);
            nav('/dashboard');
          } catch (x) {
            setErr(x.message);
          }
        }}
      >

        <label>
          Email address

          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            placeholder="you@example.com"
            required
          />
        </label>

        <label>
          Password

          <span className="pass">

            <input
              type={show ? 'text' : 'password'}
              value={pass}
              onChange={(e) =>
                setPass(e.target.value)
              }
              placeholder="At least 8 characters"
              required
            />

            <button
              type="button"
              onClick={() => setShow(!show)}
            >
              <Icon n="eye" s={18} />
            </button>

          </span>
        </label>

        <div className="form-row">

          <label className="remember">
            <input
              type="checkbox"
              defaultChecked
            />
            Keep me signed in
          </label>

          <button
            type="button"
            className="link"
            onClick={() =>
              nav('/forgot-password')
            }
          >
            Forgot password?
          </button>

        </div>

        <button className="primary wide">
          Log in
          <Icon n="arrow" s={16} />
        </button>

      </form>

      <div className="divider">
        OR CONTINUE WITH
      </div>

      <div className="social">

        <button type="button">
          G <span>Google</span>
        </button>

        <button type="button">
          in <span>LinkedIn</span>
        </button>

      </div>

      <p className="auth-foot">
        New to PrepPilot?

        <button
          className="link"
          onClick={() => nav('/signup')}
        >
          Create an account
        </button>
      </p>

    </AuthLayout>
  );
}


/* =========================================================
   SIGNUP
========================================================= */

function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <AuthLayout signup>

      <span className="eyebrow">
        GET STARTED
      </span>

      <h2>
        Create your account
      </h2>

      <p className="auth-sub">
        Set up your workspace and start practicing smarter.
      </p>

      {err && (
        <div className="error">
          {err}
        </div>
      )}

      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();

          setErr('');
          setBusy(true);

          try {
            await signup(
              name,
              email,
              pass
            );

            sessionStorage.setItem(
              'pp_notice',
              'Account created successfully. Please sign in to continue.'
            );

            nav('/login');

          } catch (x) {
            setErr(x.message);

          } finally {
            setBusy(false);
          }
        }}
      >

        <label>
          Full name

          <input
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            placeholder="Your name"
            required
          />
        </label>

        <label>
          Email address

          <input
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            type="email"
            placeholder="you@example.com"
            required
          />
        </label>

        <label>
          Password

          <input
            value={pass}
            onChange={(e) =>
              setPass(e.target.value)
            }
            type="password"
            placeholder="At least 8 characters"
            required
            minLength="8"
          />
        </label>

        <button
          className="primary wide"
          disabled={busy}
        >
          {busy
            ? 'Creating account…'
            : 'Create account'}

          <Icon n="arrow" s={16} />
        </button>

      </form>

      <p className="auth-foot">
        Already have an account?

        <button
          className="link"
          onClick={() => nav('/login')}
        >
          Log in
        </button>
      </p>

    </AuthLayout>
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [history, setHistory] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/reports/history').then(setHistory).catch((e) => setError(e.message));
    api('/interviews/current').then((data) => setActiveSession(data.session)).catch(() => setActiveSession(null));
  }, [user?.id]);
  const recent = history?.recent || [];
  return <div className="page">
    <section className="hero"><div><span className="eyebrow light">WORKSPACE OVERVIEW</span>
      <h1>Welcome back, <strong>{(user?.name || 'Candidate').split(' ')[0]}</strong></h1>
      <p>Your practice sessions and scores come from your account history.</p>
      <button className="hero-btn" onClick={() => nav('/interview-setup')}><Icon n="play" s={14} />Start interview</button>
    </div><div className="hero-stats"><Metric t="COMPLETED INTERVIEWS" v={history?.completedInterviews ?? '—'} n="Your completed sessions" />
      <Metric t="AVERAGE SCORE" v={history?.averageScore == null ? '—' : `${history.averageScore}%`} n="Across completed interviews" />
      <Metric t="LATEST SCORE" v={recent.length ? `${recent[0].score}%` : '—'} n={recent[0]?.domain?.replaceAll('-', ' ') || 'No completed session'} />
    </div></section>
    <Title t="Recent interviews" d="Your latest completed practice sessions." />
    {error && <div className="error">{error}</div>}
    {activeSession && activeSession.status === 'active' && <section className="panel"><h2>Continue your active interview</h2><p>Question {activeSession.currentQuestionIndex + 1} of {activeSession.questions.length} · {activeSession.domain.replaceAll('-', ' ')} · {activeSession.difficulty}</p><button className="primary" onClick={() => nav('/interview')}>Resume interview <Icon n="arrow" /></button></section>}
    {!history ? <section className="panel">Loading your interview history…</section> : recent.length ? <section className="panel">
      {recent.map((item) => <div className="row" key={item.sessionId}><div><b>{item.domain.replaceAll('-', ' ')}</b><span>{new Date(item.completedAt).toLocaleString()} · {item.difficulty} · {item.questionCount != null ? `${item.questionCount} questions` : 'question count unavailable'}</span></div><i className="green">Completed</i><strong>{item.score}</strong><button onClick={() => nav(`/report?sessionId=${item.sessionId}`)}>View report <Icon n="arrow" s={12} /></button></div>)}
    </section> : <section className="panel"><h2>No completed interviews yet</h2><p>Your scores and recent reports will appear here after your first practice session.</p><button className="primary" onClick={() => nav('/interview-setup')}>Start your first interview <Icon n="arrow" /></button></section>}
    {recent.length >= 2 && <section className="panel"><Title t="Score progress" d="Your most recent completed interview scores, oldest to latest." />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '140px', marginTop: '16px' }}>
        {[...recent].reverse().map((item) => (
          <div key={item.sessionId} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: `${Math.max(4, item.score)}%`, background: '#2563eb', borderRadius: '6px 6px 0 0', minHeight: '4px' }} />
            <small>{item.score}</small>
          </div>
        ))}
      </div>
    </section>}
    {recent.length === 1 && <section className="panel"><p>Complete one more interview to see your score progress over time.</p></section>}
    <div className="quick">{[['play','Start interview','Choose a domain and begin a practice session.','/interview-setup'],['star','Practice mode','Try one question with instant NLP feedback — no session recorded.','/practice'],['file','Privacy & data','How camera, microphone, and monitoring data are used.','/privacy'],['user','Your profile','Update your account profile and interview context.','/profile']].map(([icon,title,description,path])=><button className="quick-card" key={title} onClick={()=>nav(path)}><span className="tile"><Icon n={icon}/></span><b>{title}</b><p>{description}</p><small>Get started <Icon n="arrow" s={13}/></small></button>)}</div>
  </div>;
}

function Metric({ t, v, n, bar }) {
  return (
    <div className="metric">

      <span>{t}</span>

      <b>{v}</b>

      {bar && (
        <div className="mini">
          <i />
        </div>
      )}

      <small>{n}</small>

    </div>
  );
}


function Title({ t, d, compact }) {
  return (
    <div
      className={
        compact
          ? 'title compact'
          : 'title'
      }
    >
      <h2>{t}</h2>

      {d && <p>{d}</p>}
    </div>
  );
}


/* =========================================================
   INTERVIEW SETUP
========================================================= */

const domains = [
  [
    'software',
    'Software Engineering',
    'DSA, system design, coding'
  ],
  [
    'data',
    'Data Science',
    'ML, statistics, case studies'
  ],
  [
    'product',
    'Product Management',
    'Strategy, metrics, execution'
  ],
  [
    'behavioral',
    'Behavioral / HR',
    'STAR-based soft skills'
  ]
];

function Setup() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [domain, setDomain] =
    useState('software');

  const [diff, setDiff] =
    useState('medium');

  const [questionCount, setQuestionCount] = useState(5);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [step, setStep] = useState(1);
  const [rulesAck, setRulesAck] = useState(false);

  const startInterview = async () => {
    if (busy) return;
    // Independently verify acknowledgment before anything starts.
    if (!rulesAck) {
      setError('Please read and accept the interview rules before starting.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const backendDomain =
        domain === 'software'
          ? 'software-engineering'
          : domain === 'data'
          ? 'data-science'
          : domain === 'product'
          ? 'product-management'
          : 'behavioral-hr';

      const session = await api(
        '/interviews/start',
        {
          method: 'POST',
          body: JSON.stringify({
            domain: backendDomain,
            difficulty: diff,
            questionCount
          })
        }
      );

      localStorage.setItem(`pp_session_${user?.id || 'guest'}`, JSON.stringify(session));

      nav('/interview');

    } catch (e) {
      setError(
        e.message ||
        'Could not start interview'
      );

    } finally {
      setBusy(false);
    }
  };

  if (step === 2) {

    return (

      <div className="page">

        <section className="panel" style={{ maxWidth: '680px', margin: '40px auto', textAlign: 'left' }}>

          <span className="eyebrow">INTERVIEW SETUP · STEP 2 OF 2</span>

          <h2>Interview Rules &amp; Regulations</h2>

          <ul style={{ paddingLeft: '20px', lineHeight: 1.9 }}>
            <li>Keep your face visible in the camera frame during the interview.</li>
            <li>Camera and microphone are used for interview practice features.</li>
            <li>Face visibility and interview-tab switching are monitored for practice feedback.</li>
            <li>Stay on the interview tab during the practice session.</li>
            <li>You can answer by speaking or typing.</li>
            <li>Your answers are analyzed by the automated NLP evaluation system.</li>
            <li>The browser cannot completely prevent tab switching.</li>
          </ul>

          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' }}>
            <input
              type="checkbox"
              checked={rulesAck}
              onChange={(e) => setRulesAck(e.target.checked)}
            />
            <span>I have read and agree to follow these interview rules.</span>
          </label>

          {error && <div className="error" style={{ marginTop: '12px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button className="secondary" disabled={busy} onClick={() => { setError(''); setStep(1); }}>
              Back
            </button>
            <button className="primary" disabled={busy || !rulesAck} onClick={startInterview}>
              {busy ? 'Starting interview…' : 'Start interview'}
              <Icon n="arrow" />
            </button>
          </div>

        </section>

      </div>

    );
  }

  return (
    <div className="page">

      <div className="page-head">

        <div>

          <span className="eyebrow">
            INTERVIEW SETUP
          </span>

          <h1>
            Let's set up your mock interview
          </h1>

          <p>
            Choose a domain and difficulty.
            The AI adapts follow-up questions
            based on how you respond.
          </p>

        </div>

        <button
          className="secondary"
          onClick={() =>
            nav('/dashboard')
          }
        >
          ← Dashboard
        </button>

      </div>


      <div className="setup">

        <div>

          <section className="panel setup-box">

            <Title
              t="Choose a domain"
              d="Pick the track that best matches the role you're preparing for."
            />

            <div className="domains">

              {domains.map((d) => (

                <button
                  className={
                    domain === d[0]
                      ? 'choice selected'
                      : 'choice'
                  }
                  key={d[0]}
                  onClick={() =>
                    setDomain(d[0])
                  }
                >

                  <span className="tile">

                    <Icon
                      n={
                        d[0] === 'software'
                          ? 'dash'
                          : d[0] === 'data'
                          ? 'file'
                          : d[0] === 'product'
                          ? 'star'
                          : 'user'
                      }
                    />

                  </span>

                  <span>

                    <b>{d[1]}</b>
                    <small>{d[2]}</small>

                  </span>

                  {domain === d[0] && (
                    <i>✓</i>
                  )}

                </button>

              ))}

            </div>

          </section>


          <section className="panel setup-box">

            <Title
              t="Set difficulty"
              d="Start where you're comfortable — the session adjusts as you answer."
            />

            <div className="difficulties">

              {[
                [
                  'easy',
                  'Easy',
                  'Warm-up questions and lighter depth.'
                ],
                [
                  'medium',
                  'Medium',
                  'Balanced mix of depth and breadth.'
                ],
                [
                  'hard',
                  'Hard',
                  'Deep reasoning and challenging follow-ups.'
                ]
              ].map((d) => (

                <button
                  className={
                    diff === d[0]
                      ? 'difficulty selected'
                      : 'difficulty'
                  }
                  key={d[0]}
                  onClick={() =>
                    setDiff(d[0])
                  }
                >

                  <span>
                    {diff === d[0] ? '✓' : ''}
                  </span>

                  <b>{d[1]}</b>
                  <small>{d[2]}</small>

                </button>

              ))}

            </div>

          </section>


          <section className="panel setup-box">

            <Title
              t="Choose question count"
              d="Select how many distinct questions you want in this session."
            />

            <label>Questions
              <span className="select-wrap">
                <select
                  className="select"
                  value={questionCount}
                  onChange={(event) => setQuestionCount(Number(event.target.value))}
                >
                  {[3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} questions</option>)}
                </select>
                <span className="select-chevron" aria-hidden="true">▾</span>
              </span>
            </label>

          </section>

          <section className="panel setup-box">

            <Title
              t="Your session at a glance"
              d="A quick overview before you begin."
            />

            <div className="expect">

              <div>
                <Icon n="file" />
              <b>{questionCount} adaptive prompts</b>
                <small>Questions</small>
              </div>

              <div>
                <Icon n="clock" />
                <b>~{questionCount * 2} minute session</b>
                <small>Duration</small>
              </div>

              <div>
                <Icon n="video" />
                <b>Video + voice</b>
                <small>Format</small>
              </div>

            </div>

          </section>

        </div>


        <aside className="panel summary">

          <span className="eyebrow">
            SESSION SUMMARY
          </span>

          <h2>
            Ready to begin
          </h2>

          <p>
            <small>DOMAIN</small>

            <b>
              {
                domains.find(
                  (d) => d[0] === domain
                )?.[1]
              }
            </b>
          </p>

          <p>
            <small>DIFFICULTY</small>

            <b>
              {diff[0].toUpperCase() +
                diff.slice(1)}
            </b>
          </p>

          <p>
            <small>QUESTIONS</small>
            <b>{questionCount}</b>
          </p>

          <p>
            <small>EST. TIME</small>
            <b>~{questionCount * 2} min</b>
          </p>

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <button
            className="primary wide"
            disabled={busy}
            onClick={() => {
              if (!domain || !diff) {
                setError('Choose a domain and difficulty.');
                return;
              }
              if (!Number.isInteger(questionCount) || questionCount < 3 || questionCount > 8) {
                setError('Choose between 3 and 8 questions.');
                return;
              }
              setError('');
              setStep(2);
            }}
          >
            Next
            <Icon n="arrow" />
          </button>

          <div className="checklist">

            <b>Pre-flight checklist</b>

            <span>Camera and microphone permission requested on start</span>
            <span>Use a quiet room and a supported browser</span>
            <span>Profile context is optional</span>
            <span>During the interview, face visibility and tab switches are monitored to give you practice feedback</span>

          </div>

        </aside>

      </div>

    </div>
  );
}


/* =========================================================
   INTERVIEW
========================================================= */

function Interview() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [i, setI] = useState(0);
  const [sec, setSec] = useState(900);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Voice analysis state
  const [recording, setRecording] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Microphone not started');

  // Webcam / visual analysis state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Camera not started');
  const [visualMetrics, setVisualMetrics] = useState({
    faceDetected: false,
    facePresentPercent: 0,
    centeredPercent: 0,
    cameraFacingPercent: 0,
    eyeContactEstimatePercent: 0,
    smileSignalPercent: 0,
    neutralExpressionPercent: 0,
    expressionSamples: 0,
    samples: 0
  });

  const [speechMetrics, setSpeechMetrics] = useState({
    durationSeconds: 0,
    wordCount: 0,
    wordsPerMinute: 0,
    pauseCount: 0
  });

  const [confidenceAnalysis, setConfidenceAnalysis] = useState({
    score: 0,
    label: 'Waiting for analysis',
    eyeContact: 0,
    speechPace: 0,
    pauseControl: 0,
    facePresence: 0,
    expressionEngagement: 0
  });

  const recorderRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const recordingStartRef = React.useRef(0);
  const lastSpeechRef = React.useRef(0);
  const pauseCountRef = React.useRef(0);
  const recognitionRef = React.useRef(null);
  const finalTranscriptRef = React.useRef('');
  const recognitionEvidenceRef = React.useRef(false);

  const videoRef = React.useRef(null);
  const cameraStreamRef = React.useRef(null);
  const faceLandmarkerRef = React.useRef(null);
  const visualSampleTimerRef = React.useRef(null);
  const lastVideoTimeRef = React.useRef(-1);
  const lastFaceSeenRef = React.useRef(0);
  const faceWarningActiveRef = React.useRef(false);
  const faceRecoveredTimerRef = React.useRef(null);
  const tabDepartureRef = React.useRef(false);
  const [faceMissing, setFaceMissing] = React.useState(false);
  const [faceRecovered, setFaceRecovered] = React.useState(false);
  const [tabSwitchWarning, setTabSwitchWarning] = React.useState(false);
  const [tabSwitchCount, setTabSwitchCount] = React.useState(0);
  const [completedReport, setCompletedReport] = React.useState(null);
  const [feedbackRating, setFeedbackRating] = React.useState(0);
  const [feedbackComment, setFeedbackComment] = React.useState('');
  const [feedbackState, setFeedbackState] = React.useState('idle'); // idle | submitting | thanks | error
  const [feedbackError, setFeedbackError] = React.useState('');
  const [terminated, setTerminated] = React.useState(false);
  const [terminating, setTerminating] = React.useState(false);
  const [terminationConfirmed, setTerminationConfirmed] = React.useState(null);
  const terminatedRef = React.useRef(false);
  const visualStatsRef = React.useRef({
    samples: 0,
    facePresent: 0,
    centered: 0,
    cameraFacing: 0,
    smile: 0,
    neutral: 0,
    expressionSamples: 0
  });

  const startCameraAnalysis = async () => {
    if (cameraActive || busy) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('Camera and microphone access is not supported in this browser.');
        return;
      }
      setCameraStatus('Requesting camera and microphone permission…');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((type) => window.MediaRecorder?.isTypeSupported(type));
      if (!window.MediaRecorder || !mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        setCameraStatus('This browser cannot record combined audio and video in a supported format. Try current Chrome or Edge.');
        return;
      }
      cameraStreamRef.current = stream;
      chunksRef.current = [];
      recognitionEvidenceRef.current = false;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setCameraStatus('Recording failed. Retry camera and microphone access.');
      recorder.start(1000);
      recorderRef.current = recorder;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      visualStatsRef.current = { samples: 0, facePresent: 0, centered: 0, cameraFacing: 0, smile: 0, neutral: 0, expressionSamples: 0 };
      lastFaceSeenRef.current = Date.now();
      faceWarningActiveRef.current = false;
      lastVideoTimeRef.current = -1;
      setCameraActive(true);
      setRecording(true);
      setCameraStatus('Camera, microphone, and combined recording are active. Raw media stays in memory.');
      startVoiceAnalysis();
      try {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1, minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5, outputFaceBlendshapes: true
        });
      } catch (visionError) {
        faceLandmarkerRef.current = null;
        setVisualMetrics({
          faceDetected: false, facePresentPercent: 0, centeredPercent: 0,
          cameraFacingPercent: 0, eyeContactEstimatePercent: 0,
          smileSignalPercent: 0, neutralExpressionPercent: 0,
          expressionSamples: 0, samples: 0
        });
        setCameraStatus('Camera, microphone, and recording are active, but face analysis could not start (model or WASM loading failed). Metrics remain unavailable rather than showing false 0% values.');
      }
    } catch (e) {
      setCameraStatus(e.name === 'NotAllowedError'
        ? 'Camera or microphone permission was denied. Allow both and retry.'
        : e.name === 'NotFoundError'
        ? 'Camera or microphone not found. Connect devices and retry.'
        : 'Could not start camera and microphone. Check device access and retry.');
    }
  };

  const stopCameraAnalysis = () => {
    if (visualSampleTimerRef.current) {
      clearInterval(visualSampleTimerRef.current);
      visualSampleTimerRef.current = null;
    }
    if (faceRecoveredTimerRef.current) {
      clearTimeout(faceRecoveredTimerRef.current);
      faceRecoveredTimerRef.current = null;
    }
    faceWarningActiveRef.current = false;
    setFaceMissing(false);
    setFaceRecovered(false);

    if (cameraStreamRef.current) {
      if (recorderRef.current) {
        try {
          recorderRef.current.onstop = () => { chunksRef.current = []; };
          if (recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        } catch {}
        recorderRef.current = null;
      }
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (faceLandmarkerRef.current) {
      try {
        faceLandmarkerRef.current.close();
      } catch {}
      faceLandmarkerRef.current = null;
    }

    lastVideoTimeRef.current = -1;

    setCameraActive(false);
    setCameraStatus('Camera stopped');
  };

  React.useEffect(() => {
    if (session?.status === 'active') startCameraAnalysis();
  }, [session?.sessionId]);

  React.useEffect(() => {
    if (!cameraActive) return;

    const sample = () => {
      const stats = visualStatsRef.current;
      const landmarker = faceLandmarkerRef.current;
      const video = videoRef.current;

      if (!landmarker || !video || video.readyState < 2) {
        return;
      }

      const now = performance.now();

      if (video.currentTime === lastVideoTimeRef.current) {
        return;
      }

      lastVideoTimeRef.current = video.currentTime;
      stats.samples += 1;

      try {
        const result = landmarker.detectForVideo(video, now);
        const faces = result.faceLandmarks || [];
        const blendshapes = result.faceBlendshapes?.[0]?.categories || [];

        // Face-visibility monitoring: only flag after a continuous grace
        // period so single missed frames do not spam warnings.
        if (faces.length > 0) {
          lastFaceSeenRef.current = Date.now();
          if (faceWarningActiveRef.current) {
            faceWarningActiveRef.current = false;
            setFaceMissing(false);
            setFaceRecovered(true);
            api('/interviews/monitoring-event', { method: 'POST', body: JSON.stringify({ type: 'face_restored' }) }).catch(() => {});
            if (faceRecoveredTimerRef.current) clearTimeout(faceRecoveredTimerRef.current);
            faceRecoveredTimerRef.current = setTimeout(() => setFaceRecovered(false), 2500);
          }
        } else if (!faceWarningActiveRef.current && lastFaceSeenRef.current && Date.now() - lastFaceSeenRef.current >= 3000) {
          faceWarningActiveRef.current = true;
          setFaceMissing(true);
          setFaceRecovered(false);
          api('/interviews/monitoring-event', { method: 'POST', body: JSON.stringify({ type: 'face_missing' }) }).catch(() => {});
        }

        if (faces.length > 0) {
          stats.facePresent += 1;

          const landmarks = faces[0];

          const xs = landmarks.map((point) => point.x);
          const ys = landmarks.map((point) => point.y);

          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          const faceCenterX = (minX + maxX) / 2;
          const faceCenterY = (minY + maxY) / 2;

          const horizontallyCentered =
            faceCenterX >= 0.30 && faceCenterX <= 0.70;

          const verticallyCentered =
            faceCenterY >= 0.25 && faceCenterY <= 0.75;

          if (horizontallyCentered) {
            stats.centered += 1;
          }

          // Estimate camera-facing gaze using iris position.
          const leftEyeOuter = landmarks[33];
          const leftEyeInner = landmarks[133];
          const rightEyeInner = landmarks[362];
          const rightEyeOuter = landmarks[263];

          const leftIris = [468, 469, 470, 471, 472]
            .map((index) => landmarks[index])
            .filter(Boolean);

          const rightIris = [473, 474, 475, 476, 477]
            .map((index) => landmarks[index])
            .filter(Boolean);

          const averagePoint = (points) => {
            if (!points.length) return null;

            return points.reduce(
              (sum, point) => ({
                x: sum.x + point.x,
                y: sum.y + point.y
              }),
              { x: 0, y: 0 }
            );
          };

          const leftSum = averagePoint(leftIris);
          const rightSum = averagePoint(rightIris);

          const leftIrisCenter = leftSum
            ? {
                x: leftSum.x / leftIris.length,
                y: leftSum.y / leftIris.length
              }
            : null;

          const rightIrisCenter = rightSum
            ? {
                x: rightSum.x / rightIris.length,
                y: rightSum.y / rightIris.length
              }
            : null;

          const eyeRatio = (iris, outer, inner) => {
            if (!iris || !outer || !inner) return null;

            const width = Math.abs(inner.x - outer.x);

            if (width < 0.001) return null;

            return (
              (iris.x - Math.min(outer.x, inner.x)) /
              width
            );
          };

          const leftRatio = eyeRatio(
            leftIrisCenter,
            leftEyeOuter,
            leftEyeInner
          );

          const rightRatio = eyeRatio(
            rightIrisCenter,
            rightEyeOuter,
            rightEyeInner
          );

          const gazeValues = [leftRatio, rightRatio].filter(
            (value) => value !== null && Number.isFinite(value)
          );

          let gazeLooksCentered = false;

          if (gazeValues.length === 2) {
            const averageGaze =
              (gazeValues[0] + gazeValues[1]) / 2;

            gazeLooksCentered =
              averageGaze >= 0.35 &&
              averageGaze <= 0.65;
          }

          if (
            horizontallyCentered &&
            verticallyCentered &&
            gazeLooksCentered
          ) {
            stats.cameraFacing += 1;
          }

          // Observable facial-movement signals from MediaPipe blendshapes.
          const blendshapeScore = (name) =>
            blendshapes.find(
              (item) => item.categoryName === name
            )?.score || 0;

          const smileScore =
            (
              blendshapeScore('mouthSmileLeft') +
              blendshapeScore('mouthSmileRight')
            ) / 2;

          const frownScore =
            (
              blendshapeScore('mouthFrownLeft') +
              blendshapeScore('mouthFrownRight')
            ) / 2;

          const browDownScore =
            (
              blendshapeScore('browDownLeft') +
              blendshapeScore('browDownRight')
            ) / 2;

          const jawOpenScore =
            blendshapeScore('jawOpen');

          stats.expressionSamples += 1;

          if (smileScore >= 0.35) {
            stats.smile += 1;
          }

          const expressionMovement = Math.max(
            smileScore,
            frownScore,
            browDownScore,
            jawOpenScore
          );

          if (expressionMovement < 0.25) {
            stats.neutral += 1;
          }
        }

        const facePresentPercent = Math.round(
          (stats.facePresent / stats.samples) * 100
        );

        const centeredPercent = Math.round(
          (stats.centered / stats.samples) * 100
        );

        const eyeContactEstimatePercent = Math.round(
          (stats.cameraFacing / stats.samples) * 100
        );

        const smileSignalPercent = stats.expressionSamples
          ? Math.round(
              (stats.smile / stats.expressionSamples) * 100
            )
          : 0;

        const neutralExpressionPercent = stats.expressionSamples
          ? Math.round(
              (stats.neutral / stats.expressionSamples) * 100
            )
          : 0;

        setVisualMetrics({
          faceDetected: faces.length > 0,
          facePresentPercent,
          centeredPercent,
          cameraFacingPercent: eyeContactEstimatePercent,
          eyeContactEstimatePercent,
          smileSignalPercent,
          neutralExpressionPercent,
          expressionSamples: stats.expressionSamples,
          samples: stats.samples
        });
      } catch {
        setCameraStatus(
          'Camera active · face analysis temporarily unavailable'
        );
      }
    };

    const timer = setInterval(sample, 250);
    visualSampleTimerRef.current = timer;

    return () => {
      clearInterval(timer);

      if (visualSampleTimerRef.current === timer) {
        visualSampleTimerRef.current = null;
      }
    };
  }, [cameraActive]);

  const calculateConfidence = () => {
    /*
      This is an interview-delivery estimate, not a psychological
      measurement of a person's true confidence.

      We normalize observable signals into 0–100 components and combine
      them into one coaching score.
    */

    const eyeContact = visualMetrics.eyeContactEstimatePercent;

    const facePresence = visualMetrics.facePresentPercent;

    const expressionEngagement = Math.min(
      100,
      Math.round(
        visualMetrics.smileSignalPercent +
        visualMetrics.neutralExpressionPercent * 0.6
      )
    );

    // Comfortable conversational speaking pace is treated as the target.
    const liveWords = notes.trim().split(/\s+/).filter(Boolean).length;
    const liveDuration = Math.max(1, (Date.now() - recordingStartRef.current) / 1000);
    const hasSpeechData = recognitionEvidenceRef.current && liveWords > 0;
    const wpm = hasSpeechData ? (speechMetrics.wordsPerMinute || Math.round((liveWords / liveDuration) * 60)) : 0;
    let speechPace = 0;

    if (wpm === 0) {
      speechPace = 0;
    } else if (wpm >= 120 && wpm <= 165) {
      speechPace = 100;
    } else if (wpm >= 100 && wpm < 120) {
      speechPace = 85;
    } else if (wpm > 165 && wpm <= 190) {
      speechPace = 80;
    } else if (wpm >= 80 && wpm < 100) {
      speechPace = 65;
    } else if (wpm > 190 && wpm <= 220) {
      speechPace = 60;
    } else {
      speechPace = 45;
    }

    // Fewer pauses is not automatically "better"; this rewards moderate
    // pauses while avoiding a zero score when pauses are present.
    const pauseCount = hasSpeechData ? (speechMetrics.pauseCount || pauseCountRef.current) : 0;
    const pauseControl =
      pauseCount === 0
        ? 75
        : pauseCount <= 2
        ? 100
        : pauseCount <= 4
        ? 85
        : pauseCount <= 6
        ? 70
        : 55;

    const score = Math.round(
      eyeContact * 0.25 +
      speechPace * 0.20 +
      pauseControl * 0.15 +
      facePresence * 0.15 +
      expressionEngagement * 0.15 +
      50 * 0.10
    );

    const safeScore = Math.max(
      0,
      Math.min(100, score)
    );

    const hasDeliveryData = visualMetrics.samples > 0 || hasSpeechData;
    const deliveryScore = hasDeliveryData ? safeScore : 0;

    const label =
      !hasDeliveryData
        ? 'No delivery data available'
        : safeScore >= 85
        ? 'Strong delivery'
        : safeScore >= 70
        ? 'Good delivery'
        : safeScore >= 55
        ? 'Developing delivery'
        : 'Needs practice';
    const signals = hasDeliveryData
      ? { eyeContact, speechPace, pauseControl, facePresence, expressionEngagement }
      : { eyeContact: 0, speechPace: 0, pauseControl: 0, facePresence: 0, expressionEngagement: 0 };

    setConfidenceAnalysis({
      score: deliveryScore,
      label,
      ...signals
    });

    return {
      score: deliveryScore,
      label,
      ...signals
    };
  };

  const startVoiceAnalysis = async () => {
    if (recognitionRef.current) return;

    try {
      if (!cameraStreamRef.current) {
        setVoiceStatus('Start camera and microphone recording before speaking.');
        return;
      }

      pauseCountRef.current = 0;
      recordingStartRef.current = Date.now();
      lastSpeechRef.current = recordingStartRef.current;

      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          // SpeechRecognition can send the same phrase several times while
          // changing an interim result into a final result. Never append an
          // interim result directly to the answer box, otherwise words can
          // appear twice (for example: "hello hello").
          let interimTranscript = '';
          let hasFinalSpeech = false;

          for (let x = event.resultIndex; x < event.results.length; x++) {
            const text = event.results[x][0].transcript.trim();

            if (!text) continue;

            if (event.results[x].isFinal) {
              finalTranscriptRef.current =
                `${finalTranscriptRef.current} ${text}`.trim();
              hasFinalSpeech = true;
            } else {
              interimTranscript =
                `${interimTranscript} ${text}`.trim();
            }
          }

          const now = Date.now();

          if (
            hasFinalSpeech &&
            lastSpeechRef.current &&
            now - lastSpeechRef.current > 1200
          ) {
            pauseCountRef.current += 1;
          }

          if (hasFinalSpeech || interimTranscript) {
            lastSpeechRef.current = now;
          }

          const combinedTranscript = [
            finalTranscriptRef.current,
            interimTranscript
          ]
            .filter(Boolean)
            .join(' ')
            .trim();

          if (combinedTranscript) {
            recognitionEvidenceRef.current = true;
            setNotes(combinedTranscript);
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed') {
            setVoiceStatus('Microphone permission was denied');
          } else {
            setVoiceStatus('Voice transcription unavailable');
          }
          recognitionRef.current = null;
          setSpeechActive(false);
          try { recognition.stop(); } catch {}
        };

        recognition.onend = () => {
          if (recognitionRef.current === recognition) {
            window.setTimeout(() => {
              if (recognitionRef.current === recognition) {
                try { recognition.start(); } catch {}
              }
            }, 150);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setSpeechActive(true);
        setVoiceStatus('Listening and recording…');
      } else {
        setSpeechActive(false);
        setVoiceStatus('Recording… transcription is not supported in this browser');
      }
    } catch (e) {
      setVoiceStatus(
        e.name === 'NotAllowedError'
          ? 'Microphone permission was denied'
          : 'Could not access microphone'
      );
    }
  };

  const stopVoiceAnalysis = () => {
    if (!speechActive) return;

    const durationSeconds = Math.max(
      1,
      Math.round(
        (Date.now() - recordingStartRef.current) / 1000
      )
    );

    const wordCount = notes
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;

    const wordsPerMinute = Math.round(
      (wordCount / durationSeconds) * 60
    );

    const nextSpeechMetrics = {
      durationSeconds,
      wordCount,
      wordsPerMinute,
      pauseCount: pauseCountRef.current
    };

    setSpeechMetrics(nextSpeechMetrics);

    setTimeout(() => {
      calculateConfidence();
    }, 0);

    setSpeechActive(false);
    setVoiceStatus('Speech recognition paused; camera and combined recording continue.');

    try {
      recognitionRef.current?.stop();
    } catch {}

    recognitionRef.current = null;


  };

  React.useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}

      if (recorderRef.current) {
        try {
          recorderRef.current.stop();
        } catch {}

        recorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
      }

      if (visualSampleTimerRef.current) {
        clearInterval(visualSampleTimerRef.current);
      }

      if (faceRecoveredTimerRef.current) {
        clearTimeout(faceRecoveredTimerRef.current);
      }

      if (cameraStreamRef.current) {
        cameraStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  React.useEffect(() => {
    if (
      !cameraActive &&
      speechMetrics.durationSeconds === 0 &&
      visualMetrics.samples === 0
    ) {
      return;
    }

    calculateConfidence();
  }, [
    cameraActive,
    speechMetrics.durationSeconds,
    speechMetrics.wordCount,
    speechMetrics.wordsPerMinute,
    speechMetrics.pauseCount,
    visualMetrics.facePresentPercent,
    visualMetrics.eyeContactEstimatePercent,
    visualMetrics.smileSignalPercent,
    visualMetrics.neutralExpressionPercent
  ]);

  React.useEffect(() => {
    if (session?.status !== 'active') return undefined;

    let terminationStarted = false;

    const terminateOnce = async () => {
      if (terminationStarted || terminatedRef.current) return;
      terminationStarted = true;
      setTerminating(true);
      try {
        await api('/interviews/terminate', {
          method: 'POST',
          body: JSON.stringify({ reason: 'tab_switch', occurredAt: new Date().toISOString() })
        });
        setTerminationConfirmed(true);
        setSession((current) => current ? { ...current, status: 'terminated' } : current);
      } catch {
        // Server persistence failed — block interaction and tell the user.
        setTerminationConfirmed(false);
      }
      setTerminated(true);
      terminatedRef.current = true;
      try { stopVoiceAnalysis(); } catch {}
      try { stopCameraAnalysis(); } catch {}
      setTerminating(false);
    };

    const onVisibility = () => {
      if (document.hidden) terminateOnce();
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.status, session?.sessionId]);

  React.useEffect(() => {
    api('/interviews/current')
      .then((d) => {
        setSession(d.session);
        if (d.session) {
          if (d.session.status === 'terminated') {
            setTerminated(true);
            terminatedRef.current = true;
            setTerminationConfirmed(true);
          }
          setI(d.session.currentQuestionIndex);
          setSec(d.session.timerSeconds);
        } else {
          localStorage.removeItem(`pp_session_${user?.id || 'guest'}`);
        }
        setSessionLoading(false);
      })
      .catch(() => setSessionLoading(false));
  }, [user?.id]);


  React.useEffect(() => {

    if (sec <= 0) return;

    const x = setInterval(
      () =>
        setSec((v) =>
          Math.max(0, v - 1)
        ),
      1000
    );

    return () =>
      clearInterval(x);

  }, [sec]);


  const advance = async (skip = false) => {

    if (busy || terminated || terminating) return;

    setBusy(true);

    try {

      if (!skip) {
        if (!notes.trim()) throw new Error('Please speak or type an answer before continuing, or choose Skip question explicitly.');

        // Calculate from the latest live metrics immediately before
        // sending the answer, so the backend receives the current values.
        const confidence = calculateConfidence();
        const answerText = notes.trim();
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
        const wordCount = answerText.split(/\s+/).filter(Boolean).length;
        const speechRate = recognitionEvidenceRef.current ? Math.round((wordCount / durationSeconds) * 60) : 0;

        await api(
          '/interviews/answer',
          {
            method: 'POST',
            body: JSON.stringify({
              answer: answerText,
              durationSeconds,
              wordCount,
              speechRate,
              pauseCount: pauseCountRef.current,

              // Confidence-analysis metrics
              confidenceScore: confidence.score,
              eyeContactScore: confidence.eyeContact,
              speechPaceScore: confidence.speechPace,
              pauseControlScore: confidence.pauseControl,
              facePresenceScore: confidence.facePresence,
              expressionEngagementScore:
                confidence.expressionEngagement
            })
          }
        );
      } else {
        await api('/interviews/skip', { method: 'POST' });
      }


      if (
        i >=
        session.questions.length - 1
      ) {

        const done = await api(
          '/interviews/complete',
          {
            method: 'POST'
          }
        );

        stopVoiceAnalysis();
        stopCameraAnalysis();

        setCompletedReport(done);

        return;
      }


      const d = await api(
        '/interviews/next',
        {
          method: 'POST'
        }
      );

      setSession(d.session);
      setI(
        d.session.currentQuestionIndex
      );
      setSec(
        d.session.timerSeconds
      );
      setNotes('');
      finalTranscriptRef.current = '';
      recognitionEvidenceRef.current = false;
      recordingStartRef.current = Date.now();
      pauseCountRef.current = 0;
      setSpeechMetrics({
        durationSeconds: 0,
        wordCount: 0,
        wordsPerMinute: 0,
        pauseCount: 0
      });
      setConfidenceAnalysis({
        score: 0,
        label: 'Waiting for analysis',
        eyeContact: 0,
        speechPace: 0,
        pauseControl: 0,
        facePresence: 0,
        expressionEngagement: 0
      });
      visualStatsRef.current = {
        samples: 0,
        facePresent: 0,
        centered: 0,
        cameraFacing: 0,
        smile: 0,
        neutral: 0,
        expressionSamples: 0
      };
      lastVideoTimeRef.current = -1;
      setVisualMetrics({
        faceDetected: false,
        facePresentPercent: 0,
        centeredPercent: 0,
        cameraFacingPercent: 0,
        eyeContactEstimatePercent: 0,
        smileSignalPercent: 0,
        neutralExpressionPercent: 0,
        expressionSamples: 0,
        samples: 0
      });
      setVoiceStatus('Ready for the next answer. Camera and recording remain active.');
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      setSpeechActive(false);
      window.setTimeout(() => startVoiceAnalysis(), 0);
      faceWarningActiveRef.current = false;
      lastFaceSeenRef.current = Date.now();
      setFaceMissing(false);
      setFaceRecovered(false);
      if (faceRecoveredTimerRef.current) clearTimeout(faceRecoveredTimerRef.current);

    } catch (e) {

      alert(e.message);

    } finally {

      setBusy(false);

    }
  };

  const exitInterview = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api('/interviews/exit', { method: 'POST' });
      stopVoiceAnalysis();
      stopCameraAnalysis();
      localStorage.removeItem(`pp_session_${user?.id || 'guest'}`);
      nav('/dashboard');
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };


  if (terminated) {

    return (

      <div className="page">

        <section className="panel" style={{ maxWidth: '620px', margin: '40px auto' }}>

          <span className="eyebrow">SESSION ENDED</span>

          <h2>Interview Terminated</h2>

          <p>
            Your interview session has been automatically ended because you switched away from the
            interview tab. You cannot continue this session. Please start a new interview if you
            wish to try again.
          </p>

          {terminationConfirmed === false && (
            <p className="error">Termination could not be confirmed by the server. Further interview interaction is disabled; please reload and contact support if the session still appears active.</p>
          )}

          <button className="primary" onClick={() => nav('/dashboard')} style={{ marginTop: '14px' }}>
            Back to dashboard
          </button>

        </section>

      </div>

    );
  }

  if (completedReport) {

    const submitFeedback = async () => {
      if (feedbackRating < 1 || feedbackRating > 5) {
        setFeedbackError('Please select a rating from 1 to 5 stars.');
        return;
      }
      setFeedbackState('submitting');
      setFeedbackError('');
      try {
        await api('/feedback', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: completedReport.sessionId,
            rating: feedbackRating,
            comment: feedbackComment.trim()
          })
        });
        setFeedbackState('thanks');
      } catch (e) {
        setFeedbackState('error');
        setFeedbackError(e.message);
      }
    };

    return (
      <div className="page">
        <section className="panel" style={{ maxWidth: '620px', margin: '40px auto' }}>
          <span className="eyebrow">INTERVIEW COMPLETE</span>
          <h2>How was your interview experience?</h2>
          <p>Your answer feedback and delivery analysis are ready in your report. Separately, please share how the practice session felt.</p>

          {feedbackState === 'thanks' ? (
            <>
              <div className="success" style={{ margin: '14px 0' }}>Thank you! Your feedback was saved.</div>
              <button className="primary" onClick={() => nav('/report')}>View your report</button>
            </>
          ) : (
            <>
              <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: '6px', margin: '14px 0' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-pressed={feedbackRating >= star}
                    onClick={() => setFeedbackRating(star)}
                    style={{ fontSize: '26px', background: 'none', border: 'none', cursor: 'pointer', color: feedbackRating >= star ? '#e8a13a' : '#cbd5e1' }}
                  >
                    ★
                  </button>
                ))}
              </div>

              <label>
                Comment (optional)
                <textarea
                  className="answer-box"
                  rows="4"
                  maxLength={2000}
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="What went well or what should we improve?"
                />
              </label>

              {feedbackError && <p className="error">{feedbackError}</p>}

              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                <button className="primary" disabled={feedbackState === 'submitting'} onClick={submitFeedback}>
                  {feedbackState === 'submitting' ? 'Submitting…' : 'Submit feedback'}
                </button>
                <button className="secondary" onClick={() => nav('/report')}>Skip</button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  if (!session) {

    if (sessionLoading) return <div className="page"><section className="panel">Loading your active interview…</section></div>;

    return (
      <div className="page">

        <section className="panel">

          <h2>
            No active interview session
          </h2>

          <p>
            Start an interview from setup.
          </p>

          <button
            className="primary"
            onClick={() =>
              nav('/interview-setup')
            }
          >
            Go to setup
          </button>

        </section>

      </div>
    );
  }


  const qs = session.questions;


  return (
    <div className="interview">

      <div className="int-top">

        <button
          className="circle"
          onClick={exitInterview}
        >
          ←
        </button>

        <div>

          <b>
            Interview Workspace
            <span>● LIVE</span>
          </b>

          <small>
            Stay focused and answer naturally.
          </small>

        </div>

        <div className="timer">

          <Icon n="clock" />

          {String(
            Math.floor(sec / 60)
          ).padStart(2, '0')}

          :

          {String(
            sec % 60
          ).padStart(2, '0')}

        </div>

        <button
          className="secondary"
          disabled={busy}
          onClick={exitInterview}
        >
          End session
        </button>

      </div>


      <div className="int-progress">

        <span>
          QUESTION {i + 1} OF {qs.length}
        </span>

        <div className="bar">

          <i
            style={{
              width: `${
                ((i + 1) / qs.length) * 100
              }%`
            }}
          />

        </div>

        <b>
          {Math.round(
            ((i + 1) / qs.length) * 100
          )}
          %
        </b>

      </div>

      {faceMissing && (
        <div role="alert" style={{ margin: '12px 0', padding: '12px 14px', borderRadius: '10px', background: '#fdecea', color: '#b42318', border: '1px solid #f5c6c0', fontWeight: 700 }}>
          Face not detected. Please return to the camera frame.
        </div>
      )}

      {!faceMissing && faceRecovered && (
        <div role="status" style={{ margin: '12px 0', padding: '12px 14px', borderRadius: '10px', background: '#e7f6ef', color: '#067647', border: '1px solid #b7e4cf', fontWeight: 700 }}>
          Face detected. You may continue.
        </div>
      )}

      {tabSwitchWarning && (
        <div role="alert" style={{ margin: '12px 0', padding: '12px 14px', borderRadius: '10px', background: '#fff4e5', color: '#b54708', border: '1px solid #fedf89', fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <span>You left the interview screen. Please stay on this tab during the practice interview.{tabSwitchCount > 1 ? ` (${tabSwitchCount} times)` : ''}</span>
          <button type="button" className="secondary" onClick={() => setTabSwitchWarning(false)}>Dismiss</button>
        </div>
      )}

      <div className="int-grid">

        <main>

          <section className="panel question">

            <span className="eyebrow">
              CURRENT QUESTION
            </span>

            <h1>
              Take your time and think through your answer.
            </h1>

            <p>
              Structure your answer clearly,
              cite specific impact, and keep
              your response focused.
            </p>

            <small>
              Question {i + 1} of {qs.length}
            </small>

            <h2>
              {qs[i]}
            </h2>

          </section>


          <section className="panel answer">

            <div>

              <span className="tile purple">
                <Icon n="star" />
              </span>

              <div>

                <b>
                  Structure your response
                </b>

                <small>
                  Keep your answer clear,
                  specific, and outcome-focused.
                </small>

              </div>

            </div>


            <textarea
              className="answer-box"
              value={notes}
              onChange={(e) => {
                finalTranscriptRef.current = e.target.value;
                setNotes(e.target.value);
              }}
              placeholder="Type your answer or notes here..."
            />

            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: '12px'
              }}
            >
              {!speechActive ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={startVoiceAnalysis}
                >
                  🎙 Start or resume speech recognition
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={stopVoiceAnalysis}
                >
                  ⏸ Pause speech recognition
                </button>
              )}

              <small>
                {speechActive ? '● Listening — ' : ''}{voiceStatus}
              </small>
            </div>
            <small>Speech recognition support varies by browser and may use browser services. Edit the transcript or type your answer if it is unavailable.</small>

            {(speechMetrics.durationSeconds > 0 ||
              speechMetrics.wordCount > 0) && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '10px',
                  marginTop: '14px'
                }}
              >
                <div>
                  <small>Duration</small>
                  <b>{speechMetrics.durationSeconds}s</b>
                </div>

                <div>
                  <small>Words</small>
                  <b>{speechMetrics.wordCount}</b>
                </div>

                <div>
                  <small>Speech rate</small>
                  <b>{speechMetrics.wordsPerMinute} WPM</b>
                </div>

                <div>
                  <small>Pauses</small>
                  <b>{speechMetrics.pauseCount}</b>
                </div>
              </div>
            )}


            <div className="guides">

              <span>
                <b>1 · Context</b>
                Briefly explain the situation,
                problem, or goal.
              </span>

              <span>
                <b>2 · Impact</b>
                Finish with measurable results,
                tradeoffs, or learning.
              </span>

            </div>


            <div className="controls">

              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  advance(true)
                }
              >
                Skip question
              </button>

              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  advance(false)
                }
              >

                {busy
                  ? 'Submitting and analyzing…'
                  : i === qs.length - 1
                  ? 'Finish interview'
                  : 'Next question'}

                <Icon n="arrow" />

              </button>

            </div>

            {busy && <small style={{ display: 'block', marginTop: '8px' }}>Submitting your answer and running NLP evaluation…</small>}

          </section>

        </main>


        <aside>

          <section className="panel camera">

            <div
              className="cam"
              style={{
                position: 'relative',
                overflow: 'hidden',
                minHeight: '220px'
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '220px',
                  objectFit: 'cover',
                  display: cameraActive ? 'block' : 'none',
                  borderRadius: '12px'
                }}
              />

              {!cameraActive && (
                <>
                  <Icon n="video" s={34} />
                  <span>Camera preview</span>
                </>
              )}

              {cameraActive && (
                <span
                  style={{
                    position: 'absolute',
                    left: '12px',
                    bottom: '12px',
                    padding: '5px 8px',
                    borderRadius: '999px',
                    background: 'rgba(0,0,0,.65)',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                >
                  {visualMetrics.faceDetected
                    ? '● Face detected'
                    : '○ Looking for face'}
                </span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                marginTop: '10px',
                flexWrap: 'wrap'
              }}
            >
              {!cameraActive ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={startCameraAnalysis}
                >
                  📷 Retry camera and microphone
                </button>
              ) : (
                <small>Camera and microphone stay active through the session.</small>
              )}

              <small>{cameraStatus}</small>
            </div>

            {cameraActive && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '8px',
                  marginTop: '12px'
                }}
              >
                <div>
                  <small>Face present</small>
                  <b>{visualMetrics.facePresentPercent}%</b>
                </div>
                <div>
                  <small>Centered</small>
                  <b>{visualMetrics.centeredPercent}%</b>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
                marginTop: '14px'
              }}
            >
              <div>
                <small>Face present</small>
                <b>{visualMetrics.facePresentPercent}%</b>
              </div>

              <div>
                <small>Eye-contact estimate</small>
                <b>{visualMetrics.eyeContactEstimatePercent}%</b>
              </div>

              <div>
                <small>Smile signal</small>
                <b>{visualMetrics.smileSignalPercent}%</b>
              </div>

              <div>
                <small>Neutral expression</small>
                <b>{visualMetrics.neutralExpressionPercent}%</b>
              </div>
            </div>

            <small style={{ display: 'block', marginTop: '8px' }}>
              Estimated from facial landmarks and iris position; not clinical eye tracking.
            </small>

            <div
              style={{
                marginTop: '14px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(0,0,0,.08)'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div>
                  <small>Interview delivery confidence</small>
                  <b style={{ display: 'block', fontSize: '24px' }}>
                    {confidenceAnalysis.score || '—'}/100
                  </b>
                </div>

                <strong>
                  {confidenceAnalysis.label}
                </strong>
              </div>

              <div style={{ marginTop: '10px' }}>
                <small>Eye contact · {confidenceAnalysis.eyeContact}%</small>
                <div className="bar">
                  <i style={{ width: `${confidenceAnalysis.eyeContact}%` }} />
                </div>
              </div>

              <div style={{ marginTop: '8px' }}>
                <small>Speech pace · {confidenceAnalysis.speechPace}%</small>
                <div className="bar">
                  <i style={{ width: `${confidenceAnalysis.speechPace}%` }} />
                </div>
              </div>

              <div style={{ marginTop: '8px' }}>
                <small>Pause control · {confidenceAnalysis.pauseControl}%</small>
                <div className="bar">
                  <i style={{ width: `${confidenceAnalysis.pauseControl}%` }} />
                </div>
              </div>

              <div style={{ marginTop: '8px' }}>
                <small>Facial engagement · {confidenceAnalysis.expressionEngagement}%</small>
                <div className="bar">
                  <i style={{ width: `${confidenceAnalysis.expressionEngagement}%` }} />
                </div>
              </div>

              <small style={{ display: 'block', marginTop: '10px' }}>
                AI-derived interview delivery estimate — not a psychological diagnosis.
              </small>
            </div>

            <div className="mic">

              <b>Microphone</b>

              <span>
                {recording
                  ? 'Camera and microphone active · combined recording is in memory only'
                  : voiceStatus}

              </span>

            </div>

            <div className="bar">
              <i
                style={{
                  width: recording
                    ? '85%'
                    : '20%'
                }}
              />
            </div>

          </section>


          <section className="panel signals">

            <h3>
              Session guidance
            </h3>

            <p>
              ✓ Speak naturally rather than
              memorizing a script.
            </p>

            <p>
              ✓ Use concrete examples whenever possible.
            </p>

            <p>
              ✓ Mention measurable impact and tradeoffs.
            </p>

          </section>

        </aside>

      </div>

    </div>
  );
}


/* =========================================================
   REPORT
========================================================= */

function Report() {

  const nav = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('sessionId');
    api(id ? `/reports/${encodeURIComponent(id)}` : '/reports/latest')
      .then(setReport).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const downloadPdf = async () => {
    if (!report) return;

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 48;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      const ensureSpace = (needed) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      const writeLines = (text, { size = 11, bold = false, gap = 6 } = {}) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(String(text), maxWidth);
        for (const line of lines) {
          ensureSpace(size + gap);
          doc.text(line, margin, y);
          y += size + gap;
        }
        y += gap;
      };

      writeLines('PrepPilot Interview Report', { size: 20, bold: true, gap: 4 });
      writeLines(`Overall score: ${report.score}/100`, { size: 13, bold: true });
      writeLines(`Domain: ${report.domain.replaceAll('-', ' ')} · Difficulty: ${report.difficulty} · Questions: ${report.answerAnalysis?.answersEvaluated ?? 'Not available'}`);
      writeLines('Scores are heuristic feedback from an automated NLP evaluation and are not a definitive measure of interview ability.', { size: 9 });

      writeLines('Category Scores', { size: 14, bold: true });
      (report.skillCards || []).forEach((x) => writeLines(`• ${x.name}: ${x.score}/100`));

      if (report.confidenceAnalysis?.available) {
        writeLines('Delivery Estimates', { size: 14, bold: true });
        const c = report.confidenceAnalysis;
        writeLines(`• Delivery estimate: ${c.confidenceScore}/100 · Eye contact: ${c.eyeContactScore}/100 · Speech pace: ${c.speechPaceScore}/100 · Pause control: ${c.pauseControlScore}/100 · Face presence: ${c.facePresenceScore}/100`);
      }

      writeLines('Strengths', { size: 14, bold: true });
      (report.strengths || []).forEach((x) => writeLines(`• ${x}`));
      writeLines('Areas for Improvement', { size: 14, bold: true });
      (report.weaknesses || []).forEach((x) => writeLines(`• ${x}`));
      writeLines('Recommendations', { size: 14, bold: true });
      (report.recommendations || []).forEach((x) => writeLines(`• ${x}`));

      writeLines('Answer-by-Answer Review', { size: 14, bold: true });
      (report.answerAnalysis?.details || []).forEach((item, index) => {
        const evalStatus = item.evaluationStatus || 'evaluated';
        const statusLabel = evalStatus === 'insufficient_content' ? 'Insufficient content' :
                           evalStatus === 'skipped' ? 'Skipped' : 'Evaluated';
        writeLines(`Question ${index + 1} · ${item.difficulty} · ${item.category} · Status: ${statusLabel}`, { bold: true });
        writeLines(item.question, { size: 10 });
        writeLines(`Your answer: ${item.answer || '(no answer submitted)'}`, { size: 10 });
        writeLines(`Score ${item.score} · Relevance ${item.relevance} · Clarity ${item.clarity} · Completeness ${item.completeness}`, { size: 10 });
        (item.feedback || []).forEach((f) => writeLines(`Feedback: ${f}`, { size: 10 }));
        if (evalStatus === 'insufficient_content') {
          writeLines('Insufficient content to evaluate. Please provide a more detailed answer for meaningful feedback.', { size: 10 });
        }
        if (evalStatus === 'skipped') {
          writeLines('This question was skipped. No answer was provided.', { size: 10 });
        }
        if (item.starAnalysis?.required) {
          writeLines(`STAR: ${Object.entries(item.starAnalysis.components || {}).filter(([, p]) => p).map(([k]) => k).join(', ') || 'No components detected'} · ${item.starAnalysis.score}/100`, { size: 10 });
        }
        y += 6;
      });

      doc.save('PrepPilot-interview-report.pdf');
    } catch (e) {
      alert('PDF generation failed. The normal report remains available.');
    }
  };

  const download = async () => {
    if (!report) return;

    const confidence = report.confidenceAnalysis || {};

    const text = [
      'PrepPilot Interview Report',
      `Overall score: ${report.score}/100`,
      `Domain: ${report.domain.replaceAll('-', ' ')}`,
      `Difficulty: ${report.difficulty}`,
      '',
      'Skill Breakdown',
      ...report.skillCards.map((x) => `${x.name}: ${x.score}/100`),
      '',
      'Delivery Analysis',
      ...(confidence.available ? [
        `Interview delivery estimate: ${confidence.confidenceScore}/100`,
        `Eye contact estimate: ${confidence.eyeContactScore}/100`,
        `Speech pace estimate: ${confidence.speechPaceScore}/100`,
        `Pause control estimate: ${confidence.pauseControlScore}/100`,
        `Face presence: ${confidence.facePresenceScore}/100`,
        `Facial engagement: ${confidence.expressionEngagementScore}/100`
      ] : ['No camera or speech recognition metrics were available.']),
      '',
      'Strengths',
      ...report.strengths.map((x) => `- ${x}`),
      '',
      'Focus Areas',
      ...report.weaknesses.map((x) => `- ${x}`),
      '',
      'Recommendations',
      ...report.recommendations.map((x) => `- ${x}`),
      '',
      'Answer-by-Answer Review',
      ...(report.answerAnalysis?.details || []).map((item, index) => {
        const evalStatus = item.evaluationStatus || 'evaluated';
        const statusLabel = evalStatus === 'insufficient_content' ? 'Insufficient content' :
                           evalStatus === 'skipped' ? 'Skipped' : 'Evaluated';
        return [
          `Question ${index + 1} · ${item.difficulty} · ${item.category} · Status: ${statusLabel}`,
          item.question,
          `Your answer: ${item.answer || '(no answer submitted)'}`,
          `Score ${item.score} · Relevance ${item.relevance} · Clarity ${item.clarity} · Completeness ${item.completeness}`,
          ...(item.feedback || []).map((f) => `Feedback: ${f}`),
          evalStatus === 'insufficient_content' ? 'Insufficient content to evaluate. Please provide a more detailed answer for meaningful feedback.' : '',
          evalStatus === 'skipped' ? 'This question was skipped. No answer was provided.' : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n')
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'PrepPilot-interview-report.txt';
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const score = report?.score ?? 0;
  const confidence = report?.confidenceAnalysis || null;

  if (loading) return <div className="page"><section className="panel">Loading your report…</section></div>;
  if (error || !report) return <div className="page"><section className="panel"><h2>Report unavailable</h2><p>{error || 'Complete an interview to generate your first report.'}</p><button className="primary" onClick={() => nav('/interview-setup')}>Start an interview</button></section></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">PERFORMANCE REPORT</span>
          <h1>Your interview feedback is ready.</h1>
          <p>
            Review your score, answer feedback, and the actions that will make your next interview sharper.
          </p>
        </div>

        <div className="actions">
          <button className="secondary" disabled={!report} onClick={download}>
            <Icon n="download" />
            Download as text
          </button>
          <button className="secondary" disabled={!report} onClick={downloadPdf}>
            <Icon n="download" />
            Download report as PDF
          </button>
          <button className="primary" onClick={() => nav('/interview-setup')}>
            Run another session
            <Icon n="arrow" />
          </button>
        </div>
      </div>

      <section className="panel report-top">
        <div className="score">
          {score}
          <small>/100</small>
        </div>

        <div>
          <span className="eyebrow">OVERALL SCORE</span>
          <h2>
            {report?.subtitle ||
              (score >= 85
                ? 'Strong interview performance'
                : 'Good foundation with room to improve')}
          </h2>
          <p>
            {report.domain.replaceAll('-', ' ')}
            {' · '}
            {report.difficulty} difficulty
          </p>
        </div>

        <span className="ready">Ready for review</span>
      </section>

      <section className="panel">
        <p><small>Note: Your answer scores are heuristic feedback from an automated NLP evaluation. They are not a definitive measure of your interview ability, and delivery metrics are estimates only.</small></p>
      </section>

      <section className="panel report-box">
        <Title
          t="Skill breakdown"
          d="A quick view of how your answers performed across the major dimensions."
        />
        <div className="skills">
          {(report?.skillCards || []).map((x) => (
            <div key={x.name}>
              <b>{x.name}</b>
              <strong>{x.score}</strong>
              <div className="bar">
                <i style={{ width: x.score + '%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {confidence?.available && (
        <section className="panel report-box">
          <Title
            t="Interview delivery confidence"
            d="AI-derived delivery signals based on your voice and camera analysis."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '18px',
              marginTop: '20px'
            }}
          >
            <div className="stat">
              <span>DELIVERY CONFIDENCE</span>
              <b>{confidence.confidenceScore || 0}</b>
              <small>/100</small>
            </div>
            <div className="stat">
              <span>EYE CONTACT</span>
              <b>{confidence.eyeContactScore || 0}</b>
              <small>/100</small>
            </div>
            <div className="stat">
              <span>SPEECH PACE</span>
              <b>{confidence.speechPaceScore || 0}</b>
              <small>/100</small>
            </div>
            <div className="stat">
              <span>PAUSE CONTROL</span>
              <b>{confidence.pauseControlScore || 0}</b>
              <small>/100</small>
            </div>
            <div className="stat">
              <span>FACE PRESENCE</span>
              <b>{confidence.facePresenceScore || 0}</b>
              <small>/100</small>
            </div>
            <div className="stat">
              <span>FACIAL ENGAGEMENT</span>
              <b>{confidence.expressionEngagementScore || 0}</b>
              <small>/100</small>
            </div>
          </div>

          <div
            style={{
              marginTop: '18px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,.08)'
            }}
          >
            <small>
              These scores are estimates from observable speech and facial signals.
              They are not a psychological or clinical measurement of confidence.
            </small>
          </div>
        </section>
      )}

      <div className="insights">
        <Insight t="Strengths" a={report?.strengths || []} />
        <Insight t="Focus areas" a={report?.weaknesses || []} />
        <Insight t="Recommendations" a={report?.recommendations || []} />
      </div>
      <section className="panel report-box">
        <Title t="Answer-by-answer feedback" d="Heuristic content analysis compared with each question's expected concepts." />
        {(report.answerAnalysis?.details || []).map((item, index) => <article key={`${index}-${item.question}`} style={{ borderTop: '1px solid rgba(0,0,0,.08)', padding: '16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <b>Question {index + 1} · {item.difficulty} · {item.category}</b>
            <span style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              background: item.evaluationStatus === 'insufficient_content' ? '#fff1f2' :
                          item.evaluationStatus === 'skipped' ? '#f1f5f9' :
                          '#e8f5e9',
              color: item.evaluationStatus === 'insufficient_content' ? '#be123c' :
                     item.evaluationStatus === 'skipped' ? '#475569' :
                     '#166534',
            }}>
              {item.evaluationStatus === 'insufficient_content' ? 'Insufficient content' :
               item.evaluationStatus === 'skipped' ? 'Skipped' : 'Evaluated'}
            </span>
          </div>
          <p>{item.question}</p>
          <small>Score {item.score} · Relevance {item.relevance} · Clarity {item.clarity} · Completeness {item.completeness}</small>
          <p><b>Covered:</b> {(item.coveredConcepts || []).join(', ') || 'None'}<br/><b>Missing:</b> {(item.missingConcepts || []).join(', ') || 'None'}</p>
          <p><b>Technical depth estimate:</b> {item.correctness == null ? 'Not assessed' : `${item.correctness}/100`}</p>
          <small style={{ color: '#556', fontStyle: 'italic' }}>
            This estimate is based on reference-answer similarity and expected-concept coverage.
            It does not verify factual correctness.
          </small>
          {(item.feedback || []).map((feedback) => <p key={feedback}>{feedback}</p>)}
          <small>{item.explanation}</small>
          {item.evaluationStatus === 'insufficient_content' && <p style={{ color: '#be123c', fontWeight: 500, marginTop: '8px' }}>Insufficient content to evaluate. Please provide a more detailed answer for meaningful feedback.</p>}
          {item.evaluationStatus === 'skipped' && <p style={{ color: '#475569', fontWeight: 500, marginTop: '8px' }}>This question was skipped. No answer was provided.</p>}
          {item.starAnalysis?.required && <p><b>STAR:</b> {Object.entries(item.starAnalysis.components || {}).filter(([,present])=>present).map(([key])=>key).join(', ') || 'No components detected'} · {item.starAnalysis.score}/100</p>}
        </article>)}
      </section>
      <section className="panel report-box"><Title t="Adaptive difficulty history" d="Rule-based changes after each evaluated answer." />
        {(report.adaptationHistory || []).length ? report.adaptationHistory.map((entry, index) => <p key={index}>Question {entry.afterQuestion}: {entry.from} → {entry.to} · score {entry.answerScore}. {entry.reason}</p>) : <p>No difficulty changes were needed or recorded.</p>}
      </section>
    </div>
  );
}


/* =========================================================
   INSIGHT
========================================================= */

function Insight({ t, a }) {

  return (
    <section className="panel insight">

      <span className="tile">

        <Icon n="check" />

      </span>

      <h2>{t}</h2>

      {a.map((x) => (

        <p key={x}>
          ✓ {x}
        </p>

      ))}

    </section>
  );
}


/* =========================================================
   PROFILE
========================================================= */

function Profile() {
  const { user, updateUser } = useAuth();
  const profileKey = `pp_profile_${user?.id || 'guest'}`;

  const [p, setP] = useState({
    name: user?.name || 'Candidate',
    role: '',
    email: user?.email || '',
    location: 'Remote',
    bio: '',
    resume: ''
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const defaultProfile = {
      name: user?.name || 'Candidate',
      role: '',
      email: user?.email || '',
      location: 'Remote',
      bio: '',
      resume: ''
    };

    api('/profile').then((profile) => setP({ ...defaultProfile, ...profile }))
      .catch(() => setP(defaultProfile));
    setSaved(false);
  }, [profileKey, user?.name, user?.email]);

  const set = (key, value) => {
    setP((current) => ({
      ...current,
      [key]: value
    }));
    setSaved(false);
  };

  const save = async () => {
    try {
      const profile = await api('/profile', { method: 'PUT', body: JSON.stringify(p) });
      setP((current) => ({ ...current, ...profile }));
      updateUser({ name: profile.name, email: profile.email });
      setSaved(true);
    } catch (e) {
      setSaved(false);
      alert(e.message);
    }
  };

  const upload = (e) => {
    const file = e.target.files?.[0];

    if (file) {
      set('resume', file.name);
    }
  };

  return (
    <div className="page">

      <div className="page-head">

        <div>

          <span className="eyebrow">
            PROFILE
          </span>

          <h1>
            Your interview profile
          </h1>

          <p>
            Keep your details and résumé current
            for better interview generation.
          </p>

        </div>

      </div>


      <section className="panel profile-summary">

        <span className="big-avatar">
          {(p.name || 'C')[0].toUpperCase()}
        </span>


        <div>

          <h2>{p.name}</h2>

          <b>{p.role}</b>

          <p>{p.bio}</p>

          <span className="muted">
            ✉ {p.email}
            {' · '}
            ⌖ {p.location}
          </span>

        </div>


        <div className="status">

          <b>Profile status</b>

          <p>
            {p.resume
              ? 'Resume filename saved. File contents are not uploaded.'
              : 'Add a resume to personalize your sessions.'}
          </p>

        </div>

      </section>


      <div className="profile-grid">

        <section className="panel form-panel">

          <Title
            t="Personal information"
            d="Update your role, contact details, and bio."
          />


          <div className="fields">

            <Field
              l="Name"
              v={p.name}
              set={(v) =>
                set('name', v)
              }
            />

            <Field
              l="Role"
              v={p.role}
              set={(v) =>
                set('role', v)
              }
            />

            <Field
              l="Email"
              v={p.email}
              set={(v) =>
                set('email', v)
              }
            />

            <Field
              l="Location"
              v={p.location}
              set={(v) =>
                set('location', v)
              }
            />

          </div>


          <label>

            Bio

            <textarea
              className="answer-box"
              rows="5"
              value={p.bio}
              onChange={(e) =>
                set(
                  'bio',
                  e.target.value
                )
              }
            />

          </label>


          <div className="save">

            <span>
              {saved
                ? '✓ Changes saved'
                : ''}
            </span>

            <button
              className="primary"
              onClick={save}
            >
              Save changes
            </button>

          </div>

        </section>


        <aside>

          <section className="panel resume">

            <Title
              t="Resume"
              d="Save a résumé filename as profile context. The selected file itself stays on your device."
            />

            <label className="drop">

              <Icon
                n="upload"
                s={25}
              />

              <b>
                {p.resume ||
                  'Upload a PDF or DOCX résumé'}
              </b>

              <small>
                Click to browse your computer
              </small>

              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={upload}
              />

            </label>

          </section>


          <section className="panel timeline">
            <h3>Interview context</h3>
            <p><b>{p.role || 'Add a target role'}</b><br />Current target role for practice</p>
            {p.bio && <p>{p.bio}</p>}

          </section>

        </aside>

      </div>

    </div>
  );
}


/* =========================================================
   FIELD
========================================================= */

function Field({ l, v, set }) {

  return (
    <label>

      {l}

      <input
        value={v}
        onChange={(e) =>
          set(e.target.value)
        }
      />

    </label>
  );
}


/* =========================================================
   FORGOT PASSWORD
========================================================= */

function Forgot() {

  const [sent, setSent] =
    useState(false);

  const [email, setEmail] =
    useState('');


  return (
    <div className="simple">

      <div className="simple-card">

        <div className="brand">

          <span className="mark">
            P
          </span>

          <b>PrepPilot</b>

        </div>


        <span className="eyebrow">
          ACCOUNT RECOVERY
        </span>


        <h1>
          Reset your password
        </h1>


        <p>
          Enter the email associated with
          your account and we'll send you
          a reset link.
        </p>


        {sent ? (

          <div className="success">

            If an account exists for {email},
            a reset link has been sent.

          </div>

        ) : (

          <form
            className="form"
            onSubmit={(e) => {

              e.preventDefault();
              setSent(true);

            }}
          >

            <label>

              Email address

              <input
                required
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                placeholder="you@example.com"
              />

            </label>


            <button className="primary wide">
              Send reset link
            </button>

          </form>

        )}

      </div>

    </div>
  );
}


function Practice() {
  const { user } = useAuth();
  const [domain, setDomain] = useState('software-engineering');
  const [difficulty, setDifficulty] = useState('medium');
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchQuestion = async () => {
    setBusy(true); setError(''); setResult(null); setAnswer('');
    try {
      const q = await api(`/practice/question?domain=${encodeURIComponent(domain)}&difficulty=${encodeURIComponent(difficulty)}`);
      setQuestion(q);
    } catch (e) { setError(e.message); setQuestion(null); }
    finally { setBusy(false); }
  };

  const evaluate = async () => {
    if (!answer.trim()) { setError('Type an answer first.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api('/practice/evaluate', { method: 'POST', body: JSON.stringify({ questionId: question.questionId, answer: answer.trim() }) });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">PRACTICE MODE</span>
          <h1>Try a question with instant feedback.</h1>
          <p>Practice answers are evaluated by the same NLP service but are not saved as interviews, reports, or dashboard statistics.</p>
        </div>
      </div>

      <section className="panel">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>Domain
            <span className="select-wrap">
              <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="software-engineering">Software Engineering</option>
                <option value="data-science">Data Science</option>
                <option value="product-management">Product Management</option>
                <option value="behavioral-hr">Behavioral / HR</option>
              </select>
              <span className="select-chevron" aria-hidden="true">▾</span>
            </span>
          </label>
          <label>Difficulty
            <span className="select-wrap">
              <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <span className="select-chevron" aria-hidden="true">▾</span>
            </span>
          </label>
          <button className="primary" disabled={busy} onClick={fetchQuestion}>{question ? 'New question' : 'Get a question'}</button>
        </div>

        {error && <div className="error" style={{ marginTop: '12px' }}>{error}</div>}

        {question && (
          <>
            <p style={{ marginTop: '16px' }}><b>{question.text}</b> <small>· {question.difficulty} · {question.category}</small></p>
            <textarea rows="6" className="answer-box" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your practice answer here…" />
            <button className="primary" style={{ marginTop: '10px' }} disabled={busy} onClick={evaluate}>{busy ? 'Analyzing…' : 'Get feedback'}</button>
          </>
        )}

        {result && (
          <div style={{ marginTop: '18px', borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: '14px' }}>
            <h3>Feedback ({result.analysis.score}/100)</h3>
            <small>Relevance {result.analysis.relevanceScore} · Technical depth {result.analysis.technicalScore} · Clarity {result.analysis.clarityScore} · Completeness {result.analysis.completeness}</small>
            <p><b>Covered:</b> {(result.analysis.matchedConcepts || []).join(', ') || 'None'}</p>
            <p><b>Missing:</b> {(result.analysis.missingConcepts || []).join(', ') || 'None'}</p>
            {(result.analysis.feedback || []).map((f) => <p key={f}>• {f}</p>)}
            {result.analysis.starAnalysis?.required && <p><b>STAR:</b> {Object.entries(result.analysis.starAnalysis.components || {}).filter(([, p]) => p).map(([k]) => k).join(', ') || 'No components detected'} · {result.analysis.starAnalysis.score}/100</p>}
          </div>
        )}
      </section>
    </div>
  );
}


/* =========================================================
   PRIVACY
========================================================= */

function Privacy() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">PRIVACY &amp; DATA</span>
          <h1>How PrepPilot handles your data.</h1>
        </div>
      </div>

      <section className="panel" style={{ lineHeight: 1.8 }}>
        <h3>Why camera access is requested</h3>
        <p>During an active interview, your camera feed is analyzed in the browser (MediaPipe Face Landmarker) to produce face-presence, framing, and engagement estimates for practice feedback. The raw video stream is not uploaded to the PrepPilot backend.</p>

        <h3>Why microphone access is requested</h3>
        <p>Your microphone captures your spoken answers so they can be transcribed (browser speech recognition where supported) and evaluated. Raw audio is kept in memory during the session and is not stored on the server.</p>

        <h3>What is recorded and saved</h3>
        <ul>
          <li>Your answer transcripts and their NLP evaluation scores, concept coverage, and feedback.</li>
          <li>Delivery metrics derived from your speech and camera analysis (speech rate, pauses, face presence, eye-contact estimate).</li>
          <li>Monitoring events (face missing, tab switched) with timestamps, stored on your interview session.</li>
          <li>Your profile details you choose to save, and any feedback you submit about the app.</li>
        </ul>

        <h3>What is shared</h3>
        <p>Answer text is evaluated server-side by the PrepPilot backend. Browser speech recognition may use your browser vendor's services depending on your browser. PrepPilot does not sell or share your account data as a product feature.</p>

        <h3>Your control</h3>
        <p>You can log out at any time, deny camera/microphone permission, type your answer instead of speaking, and choose not to submit app feedback. To request deletion of saved data, contact the project maintainer.</p>
      </section>
    </div>
  );
}


/* =========================================================
   NOT FOUND
========================================================= */

function NotFound() {

  return (
    <div className="simple">

      <div className="simple-card">

        <span className="eyebrow">
          404
        </span>

        <h1>
          Page not found
        </h1>

        <p>
          The page you're looking for doesn't exist.
        </p>

        <button
          className="primary"
          onClick={() =>
            (window.location.href =
              '/dashboard')
          }
        >
          Back to dashboard
        </button>

      </div>

    </div>
  );
}


/* =========================================================
   APP ROUTES
========================================================= */

function App() {

  return (
    <AuthProvider>

      <Routes>

        {/* Public routes */}

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/signup"
          element={<Signup />}
        />

        <Route
          path="/forgot-password"
          element={<Forgot />}
        />


        {/* Protected routes */}

        <Route element={<Protected />}>

          <Route element={<Shell />}>

            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            <Route
              path="/interview-setup"
              element={<Setup />}
            />

            <Route
              path="/interview"
              element={<Interview />}
            />

            <Route
              path="/report"
              element={<Report />}
            />

            <Route
              path="/practice"
              element={<Practice />}
            />

            <Route
              path="/privacy"
              element={<Privacy />}
            />

            <Route
              path="/profile"
              element={<Profile />}
            />

          </Route>

        </Route>


        {/* Default */}

        <Route
          path="/"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />


        {/* 404 */}

        <Route
          path="*"
          element={<NotFound />}
        />

      </Routes>

    </AuthProvider>
  );
}


/* =========================================================
   ROOT
========================================================= */

createRoot(
  document.getElementById('root')
).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
