import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import MemberSite from "./member-site";

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // 初回チェック
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // ログイン状態変化
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // 👇ここが超重要
  if (!session) {
    return <Login />;
  }

  return <MemberSite />;
}

export default App;
