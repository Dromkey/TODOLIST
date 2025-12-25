import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = "http://localhost:5000/api";
const TASKS_ENDPOINT = `${API_BASE}/tasks`;

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const FILTERS = {
  all: { label: "All", fn: () => true },
  active: { label: "Active", fn: (t) => !t.completed },
  completed: { label: "Completed", fn: (t) => t.completed },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // 'login' or 'register'
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [tasks, setTasks] = useState(() => {
    try {
      const s = localStorage.getItem("todo_tasks_v1");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("all");
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("todo_theme_v1");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    setIsAuthenticated(!!token);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("todo_theme_v1", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("todo_tasks_v1", JSON.stringify(tasks));
  }, [tasks]);

useEffect(() => {
    if (!isAuthenticated) return;

    let mounted = true;
    setLoading(true);
    fetch(TASKS_ENDPOINT, { headers: { "Content-Type": "application/json", ...authHeaders() } })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) {
            // Token không hợp lệ, đăng xuất
            localStorage.removeItem("auth_token");
            setIsAuthenticated(false);
            throw new Error("Session expired");
          }
          throw new Error(`Status ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        // Kiểm tra data có phải array không
        if (!Array.isArray(data)) {
          console.warn("Data is not an array:", data);
          setError("");
          return;
        }
        const normalized = data.map((t) => ({
          id: t._id || t.id || Date.now() + Math.random(),
          text: t.text || t.title || "",
          completed: !!t.completed,
          createdAt: t.createdAt || Date.now(),
        }));
        setTasks(normalized);
        setError(null);
      })
      .catch((err) => {
        console.warn("Fetch tasks failed:", err);
        if (err.message !== "Session expired") {
          setError("Không thể kết nối server — đang dùng dữ liệu local");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [isAuthenticated]);

  async function callApi(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) };
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
      }
      try {
        return await res.json();
      } catch {
        return null;
      }
    } catch (err) {
      console.warn("API call failed:", err);
      throw err;
    }
  }

  function extractIdFromServerResp(res) {
    if (!res) return null;
    if (typeof res === "string") return res;
    if (res._id) {
      if (typeof res._id === "string") return res._id;
      if (res._id.$oid) return res._id.$oid;
      if (res._id.Hex) return res._id.Hex;
    }
    if (res.insertedId) return res.insertedId;
    if (res.insertedID) return res.insertedID;
    if (res.inserted_id) return res.inserted_id;
    for (const k of Object.keys(res)) {
      if (typeof res[k] === "string" && /^[a-fA-F0-9]{12,24}$/.test(res[k])) return res[k];
    }
    return null;
  }

  function isValidObjectId(id) {
    return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
  }

  // Auth functions
  const handleAuth = async (email, password, username = "") => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const endpoint = authMode === "login" ? "/login" : "/register";
      const body = authMode === "login" 
        ? { email, password }
        : { email, password, username };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Authentication failed");
      }

      // Save token
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
        setIsAuthenticated(true);
        setAuthError("");
      } else {
        throw new Error("No token received");
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setIsAuthenticated(false);
    setTasks([]);
  };

  // Add
  const addTask = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const optimistic = {
      id: `local-${Date.now()}`,
      text: trimmed,
      completed: false,
      createdAt: Date.now(),
    };
    setTasks((prev) => [optimistic, ...prev]);
    setInput("");
    try {
      const payload = { text: trimmed };
      const serverRes = await callApi("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const serverId = extractIdFromServerResp(serverRes);
      if (serverId) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === optimistic.id ? { ...t, id: serverId } : t
          )
        );
      } else {
        console.warn("Server returned no usable id for POST:", serverRes);
      }
    } catch (err) {
      setError("Không lưu được lên server — lưu tạm local.");
      console.warn("POST failed:", err);
    }
  };

  const toggleComplete = async (id) => {
    if (!id) {
      console.warn("toggleComplete called with invalid id:", id);
      setError("Không xác định được task id (bỏ qua).");
      return;
    }

    const currentTask = tasks.find((t) => t.id === id);
    if (!currentTask) {
      console.warn("toggleComplete: task not found in state for id:", id);
      return;
    }

    const updatedCompleted = !currentTask.completed;

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: updatedCompleted } : t))
    );

    if (String(id).startsWith("local-") || !isValidObjectId(id)) {
      console.info("toggleComplete: skipping server update for local/invalid id:", id);
      return;
    }

    try {
      await callApi(`/tasks/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ completed: updatedCompleted }),
      });
    } catch (err) {
      setError("Không cập nhật trạng thái trên server.");
      console.warn("API call failed in toggleComplete:", err);
    }
  };

  const deleteTask = async (id) => {
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await callApi(`/tasks/${id}`, { method: "DELETE" });
    } catch (err) {
      setError("Không xóa được trên server.");
      setTasks(before);
    }
  };

  const saveEdit = async (id, newText) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text: newText } : t)));
    try {
      await callApi(`/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ text: newText }),
      });
    } catch {
      setError("Không cập nhật được trên server.");
    }
  };

  const clearCompleted = async () => {
    const remaining = tasks.filter((t) => !t.completed);
    setTasks(remaining);
    try {
      const completed = tasks.filter((t) => t.completed);
      await Promise.all(completed.map((c) => callApi(`/tasks/${c.id}`, { method: "DELETE" })));
    } catch {
      setError("Không xóa hoàn thành trên server.");
    }
  };

  const filtered = tasks.filter(FILTERS[filter].fn);
  const handleKeyDown = (e) => {
    if (e.key === "Enter") addTask();
  };
  const itemsLeft = tasks.filter((t) => !t.completed).length;

  // If not authenticated, show login/register form
  if (!isAuthenticated) {
    return <AuthForm 
      mode={authMode} 
      onToggleMode={() => setAuthMode(authMode === "login" ? "register" : "login")}
      onSubmit={handleAuth}
      loading={authLoading}
      error={authError}
      dark={dark}
      onToggleDark={() => setDark(!dark)}
    />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <style>{`
        :root {
          --bg: #e0e5ec;
          --text: #2c3e50;
          --surface: #e0e5ec;
          --muted: #7f8c8d;
          --accent: #3498db;
          --shadow1: 9px 9px 16px rgba(163, 177, 198, 0.6);
          --shadow2: -9px -9px 16px rgba(255, 255, 255, 0.5);
        }
        .dark {
          --bg: #1a1a2e;
          --text: #eee;
          --surface: #16213e;
          --muted: #95a5a6;
          --accent: #3498db;
          --shadow1: 9px 9px 16px rgba(0, 0, 0, 0.4);
          --shadow2: -9px -9px 16px rgba(38, 50, 77, 0.3);
        }
        .neu {
          border-radius: 20px;
          background: var(--surface);
          box-shadow: var(--shadow1), var(--shadow2);
        }
        .neu-inset {
          border-radius: 12px;
          background: var(--surface);
          box-shadow: inset 5px 5px 10px rgba(163, 177, 198, 0.4),
                      inset -5px -5px 10px rgba(255, 255, 255, 0.3);
        }
        .dark .neu-inset {
          box-shadow: inset 5px 5px 10px rgba(0, 0, 0, 0.5),
                      inset -5px -5px 10px rgba(38, 50, 77, 0.3);
        }
        .neu-btn {
          border-radius: 10px;
          background: var(--surface);
          box-shadow: 5px 5px 10px rgba(163, 177, 198, 0.5),
                      -5px -5px 10px rgba(255, 255, 255, 0.4);
          transition: all 0.2s;
          border: none;
          cursor: pointer;
          color: var(--text);
        }
        .dark .neu-btn {
          box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.4),
                      -5px -5px 10px rgba(38, 50, 77, 0.3);
        }
        .neu-btn:hover {
          box-shadow: 3px 3px 6px rgba(163, 177, 198, 0.5),
                      -3px -3px 6px rgba(255, 255, 255, 0.4);
        }
        .neu-btn:active {
          box-shadow: inset 3px 3px 6px rgba(163, 177, 198, 0.5),
                      inset -3px -3px 6px rgba(255, 255, 255, 0.4);
        }
        .neu-input {
          color: var(--text);
        }
        .neu-input::placeholder {
          color: var(--muted);
        }
        .bg-accent {
          background: var(--accent);
        }
        .text-muted {
          color: var(--muted);
        }
      `}</style>

      <div className="w-full max-w-2xl p-6 neu">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Neumorphism Todo</h1>

          <div className="flex items-center gap-3">
            <div className="text-sm" style={{ color: "var(--muted)" }}>{loading ? "Loading..." : `${itemsLeft} left`}</div>
            <button
              onClick={() => setDark(!dark)}
              className="neu-btn px-3 py-2"
            >
              {dark ? "🌙" : "☀️"}
            </button>
            <button
              onClick={handleLogout}
              className="neu-btn px-3 py-2 text-sm"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        <div className="mb-4 flex gap-3">
          <div className="flex-1 neu-inset p-3 flex items-center gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="neu-input text-base w-full bg-transparent outline-none"
              placeholder="What needs to be done?"
            />
          </div>
          <button onClick={addTask} className="neu-btn px-4 py-2">Add</button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {Object.keys(FILTERS).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-lg ${filter === k ? "bg-accent text-white" : "neu-btn"}`}
            >
              {FILTERS[k].label}
            </button>
          ))}
          <div className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
            {tasks.length} total
          </div>
        </div>

        <ul className="space-y-3">
          <AnimatePresence>
            {filtered.map((task) => (
              <motion.li
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center justify-between p-3 rounded-lg`}
                style={{ background: "var(--surface)", boxShadow: "var(--shadow1), var(--shadow2)" }}
              >
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => toggleComplete(task.id)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${task.completed ? "bg-green-100 text-green-600" : "bg-transparent"}`}
                    aria-label="toggle"
                    title={task.completed ? "Completed" : "Mark complete"}
                  >
                    {task.completed ? "✓" : "○"}
                  </button>

                  <TaskText
                    task={task}
                    onSave={(newText) => saveEdit(task.id, newText)}
                  />
                </div>

                <div className="flex items-center gap-2 ml-3">
                  <button onClick={() => deleteTask(task.id)} className="px-3 py-1 neu-btn text-sm text-red-500">Delete</button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="flex items-center justify-between mt-6">
          <div style={{ color: "var(--muted)" }}>{tasks.length} total</div>
          <div className="flex items-center gap-3">
            <button onClick={clearCompleted} className="neu-btn px-3 py-2 text-sm text-red-500">Clear completed</button>
            <button onClick={() => { if (window.confirm("Reset all tasks?")) setTasks([]); }} className="neu-btn px-3 py-2 text-sm">Reset</button>
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
      </div>
    </div>
  );
}

function TaskText({ task, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(task.text);

  useEffect(() => setVal(task.text), [task.text]);

  const save = () => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setEditing(false);
  };

  return (
    <>
      {!editing ? (
        <div className={`flex-1 select-none ${task.completed ? "line-through text-muted" : ""}`} style={{ color: "var(--text)" }}>
          <div onDoubleClick={() => setEditing(true)}>{task.text}</div>
        </div>
      ) : (
        <div className="flex-1">
          <input
            className="w-full bg-transparent border-none outline-none"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
      )}
    </>
  );
}

function AuthForm({ mode, onToggleMode, onSubmit, loading, error, dark, onToggleDark }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(email, password, username);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <style>{`
        :root {
          --bg: #e0e5ec;
          --text: #2c3e50;
          --surface: #e0e5ec;
          --muted: #7f8c8d;
          --accent: #3498db;
          --shadow1: 9px 9px 16px rgba(163, 177, 198, 0.6);
          --shadow2: -9px -9px 16px rgba(255, 255, 255, 0.5);
        }
        .dark {
          --bg: #1a1a2e;
          --text: #eee;
          --surface: #16213e;
          --muted: #95a5a6;
          --accent: #3498db;
          --shadow1: 9px 9px 16px rgba(0, 0, 0, 0.4);
          --shadow2: -9px -9px 16px rgba(38, 50, 77, 0.3);
        }
        .neu {
          border-radius: 20px;
          background: var(--surface);
          box-shadow: var(--shadow1), var(--shadow2);
        }
        .neu-inset {
          border-radius: 12px;
          background: var(--surface);
          box-shadow: inset 5px 5px 10px rgba(163, 177, 198, 0.4),
                      inset -5px -5px 10px rgba(255, 255, 255, 0.3);
        }
        .dark .neu-inset {
          box-shadow: inset 5px 5px 10px rgba(0, 0, 0, 0.5),
                      inset -5px -5px 10px rgba(38, 50, 77, 0.3);
        }
        .neu-btn {
          border-radius: 10px;
          background: var(--surface);
          box-shadow: 5px 5px 10px rgba(163, 177, 198, 0.5),
                      -5px -5px 10px rgba(255, 255, 255, 0.4);
          transition: all 0.2s;
          border: none;
          cursor: pointer;
          color: var(--text);
        }
        .dark .neu-btn {
          box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.4),
                      -5px -5px 10px rgba(38, 50, 77, 0.3);
        }
        .neu-btn:hover {
          box-shadow: 3px 3px 6px rgba(163, 177, 198, 0.5),
                      -3px -3px 6px rgba(255, 255, 255, 0.4);
        }
        .neu-btn:active {
          box-shadow: inset 3px 3px 6px rgba(163, 177, 198, 0.5),
                      inset -3px -3px 6px rgba(255, 255, 255, 0.4);
        }
        .neu-input {
          color: var(--text);
        }
        .neu-input::placeholder {
          color: var(--muted);
        }
        .bg-accent {
          background: var(--accent);
        }
      `}</style>

      <div className="w-full max-w-md p-8 neu">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">
            {mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </h1>
          <button
            onClick={onToggleDark}
            className="neu-btn px-3 py-2"
          >
            {dark ? "🌙" : "☀️"}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>Tên người dùng</label>
              <div className="neu-inset p-3">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="neu-input w-full bg-transparent outline-none"
                  placeholder="Nhập tên của bạn"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>Email</label>
            <div className="neu-inset p-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="neu-input w-full bg-transparent outline-none"
                placeholder="example@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>Mật khẩu</label>
            <div className="neu-inset p-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neu-input w-full bg-transparent outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-500 p-3 rounded-lg" style={{ background: "var(--surface)" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full neu-btn px-4 py-3 bg-accent text-white font-semibold"
          >
            {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={onToggleMode}
            className="text-sm"
            style={{ color: "var(--accent)" }}
          >
            {mode === "login" 
              ? "Chưa có tài khoản? Đăng ký ngay" 
              : "Đã có tài khoản? Đăng nhập"}
          </button>
        </div>
      </div>
    </div>
  );
}