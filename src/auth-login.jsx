import { useState, useEffect } from 'react';
import { supabase } from './supabase';

const Login = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // ページを開いた瞬間にセッションを確認（タブ閉じても残るように）
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = "/";
    });
  }, []);

  const handleLogin = async () => {
    if (!userId || !password) {
      setError("ユーザーIDとパスワードを入力してください");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: member } = await supabase
        .from('members')
        .select('email')
        .eq('user_id', userId.trim())
        .single();

      if (!member?.email) throw new Error("ユーザーIDが見つかりません");

      const { error } = await supabase.auth.signInWithPassword({
        email: member.email,
        password: password,
      });

      if (error) throw error;

      window.location.href = "/";
    } catch (err) {
      setError(err.message || "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{
        background: "white",
        width: "100%",
        maxWidth: "420px",
        borderRadius: "24px",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        padding: "48px 36px",
        textAlign: "center"
      }}>
        <h1 style={{
          margin: "0 0 8px 0",
          fontSize: "36px",
          fontWeight: "900",
          letterSpacing: "-2px",
          background: "linear-gradient(90deg, #38bdf8, #818cf8)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent"
        }}>
          pointnet
        </h1>
        <p style={{ color: "#64748b", marginBottom: "40px", fontSize: "15px" }}>
          会員ログイン
        </p>

        <div style={{ marginBottom: "28px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>
            ユーザーID
          </label>
          <input
            type="text"
            placeholder="ユーザーIDを入力"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{
              width: "100%",
              padding: "16px 18px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              fontSize: "16px",
              outline: "none"
            }}
          />
        </div>

        <div style={{ marginBottom: "36px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>
            パスワード
          </label>
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "16px 18px",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              fontSize: "16px",
              outline: "none"
            }}
          />
        </div>

        {error && <p style={{ color: "#ef4444", marginBottom: "24px" }}>{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "17px",
            background: "linear-gradient(90deg, #38bdf8, #818cf8)",
            color: "white",
            border: "none",
            borderRadius: "14px",
            fontSize: "17px",
            fontWeight: "700",
            boxShadow: "0 10px 25px rgba(56,189,248,0.4)"
          }}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        <p style={{ marginTop: "32px", color: "#64748b", fontSize: "14px" }}>
          アカウントがない方は <a href="/register" style={{ color: "#38bdf8", fontWeight: "600" }}>新規登録</a>
        </p>
      </div>
    </div>
  );
};

export default Login;