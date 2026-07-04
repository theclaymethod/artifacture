# Task: Explain Diff

Create a visual explainer that teaches this diff to a developer who knows TypeScript but has not seen this repository. Use the explain-diff arc: background, intuition, code walkthrough, and quiz. The main value should be understanding why the change exists and how the behavior differs.

```diff
diff --git a/src/billing/renewal.ts b/src/billing/renewal.ts
index 34a8271..9c4f33d 100644
--- a/src/billing/renewal.ts
+++ b/src/billing/renewal.ts
@@ -1,21 +1,28 @@
 type Account = {
   id: string;
   plan: 'trial' | 'paid';
   renewsAt: Date;
   balanceCents: number;
 };
 
 export function renewalState(account: Account, now = new Date()) {
-  if (account.plan === 'trial') {
-    return { status: 'trial', chargeCents: 0 };
-  }
+  const daysUntilRenewal = Math.ceil(
+    (account.renewsAt.getTime() - now.getTime()) / 86_400_000,
+  );
 
-  if (account.balanceCents < 0) {
-    return { status: 'blocked', chargeCents: 0 };
+  if (account.plan === 'trial') {
+    return {
+      status: daysUntilRenewal <= 0 ? 'expired_trial' : 'trial',
+      chargeCents: 0,
+    };
   }
 
-  return {
-    status: account.renewsAt <= now ? 'charge_due' : 'active',
-    chargeCents: account.renewsAt <= now ? account.balanceCents : 0,
-  };
+  if (account.balanceCents < 0) return { status: 'blocked', chargeCents: 0 };
+  if (daysUntilRenewal > 0) return { status: 'active', chargeCents: 0 };
+  return { status: 'charge_due', chargeCents: account.balanceCents };
 }
```

## Must Cover

- Why `daysUntilRenewal` is computed before the plan branch.
- How trial accounts now distinguish active trial from expired trial.
- Why negative paid balances still short-circuit to `blocked`.
- How the final paid-account branches correspond to active vs. charge due.
- Include 5 medium quiz questions with one correct option each.
