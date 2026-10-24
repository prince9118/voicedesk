// A question typed on the landing page before signing up. It waits in sessionStorage and is put into
// the composer once the visitor is signed in. Its own module, so the landing page does not import
// the whole home screen just for one string.
export const PENDING_QUESTION_KEY = "voicedesk.pending-question";

// Storage can be blocked (private mode); then the visitor simply retypes the question.
export function rememberPendingQuestion(question: string): void {
  try {
    if (question.trim()) sessionStorage.setItem(PENDING_QUESTION_KEY, question.trim());
  } catch {
    // ignored on purpose
  }
}
