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

  if (!session) {
    return <Login />;
  }

  return <MemberSite />;
}

export default App;
