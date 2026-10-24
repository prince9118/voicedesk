import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Tooltip } from "radix-ui";
import { useEffect, useState } from "react";
import { api, sessionStore, setUnauthorizedHandler, type User } from "./api/client";
import { Home } from "./home/Home";
import { LandingPage } from "./landing/LandingPage";
import { fadeUp } from "./ui/primitives";

type AuthState = { kind: "checking" } | { kind: "signed-out" } | { kind: "signed-in"; user: User };

export function App() {
  const [auth, setAuth] = useState<AuthState>(() => (sessionStore.get() ? { kind: "checking" } : { kind: "signed-out" }));

  // Any 401 (expired or revoked session) sends the user back to sign-in.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionStore.clear();
      setAuth({ kind: "signed-out" });
    });
  }, []);

  // Restore a session after reload: the token may have expired or been revoked server-side.
  useEffect(() => {
    if (auth.kind !== "checking") return;
    api
      .me()
      .then((user) => setAuth({ kind: "signed-in", user }))
      .catch(() => setAuth({ kind: "signed-out" }));
  }, [auth.kind]);

  return (
    // reducedMotion="user": people who ask their OS for less motion get fades instead of movement.
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={300}>
        <div className="min-h-full">
          <AnimatePresence mode="wait">
            {auth.kind === "checking" && <motion.div key="checking" {...fadeUp} className="min-h-screen" />}
            {auth.kind === "signed-out" && <LandingPage key="landing" onAuthenticated={(user) => setAuth({ kind: "signed-in", user })} />}
            {auth.kind === "signed-in" && (
              <Home
                key="home"
                user={auth.user}
                onSignOut={async () => {
                  await api.logout().catch(() => undefined);
                  setAuth({ kind: "signed-out" });
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </Tooltip.Provider>
    </MotionConfig>
  );
}
