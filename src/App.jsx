import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import MemberSite from "./member-site";

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // 👇 未ログイン → 元のログイン画面
  if (!session) {
    return <Login />;
  }

  // 👇 ログイン済み → 元の会員画面
  return <MemberSite />;
}

export default App;
