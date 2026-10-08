import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const question = String(body.question ?? "");
    const snapshot = body.snapshot ?? {};

    const [{ data: logs }, { data: foods }, { data: sets }, { data: history }] =
      await Promise.all([
        supabase.from("rmc_daily_logs").select("*").eq("user_id", user.id)
          .order("log_date", { ascending: false }).limit(28),
        supabase.from("rmc_food_logs").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("rmc_workout_sets").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(300),
        supabase.from("rmc_coach_runs")
          .select("created_at,question,answer,provider,model")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);

    const context = {
      question,
      snapshot,
      logs: logs ?? [],
      foods: foods ?? [],
      sets: sets ?? [],
      recentCoach: history ?? [],
    };

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    let answer = "";
    let provider = "local";
    let model = "local-adaptive";
    let action: any = null;

    if (apiKey) {
      const selectedModel = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          input: [
            {
              role: "system",
              content: [{
                type: "input_text",
                text:
                  "You are Ronak Muscle Coach. Give concise, evidence-aware fitness/nutrition coaching. Use the user's actual history. Do not diagnose medical conditions. Do not react to one weigh-in; use trends. Never silently change plans. If a meaningful change is warranted, return one proposed action with type, title, rationale, and proposed_value. Output JSON only: {answer:string, action:{action_type:string,title:string,rationale:string,proposed_value:object}|null}.",
              }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: JSON.stringify(context) }],
            },
          ],
          text: { format: { type: "json_object" } },
        }),
      });

      if (resp.ok) {
        const j = await resp.json();
        const raw = j.output_text ||
          j.output?.flatMap((x: any) => x.content || [])
            .find((x: any) => x.type === "output_text")?.text || "";
        const parsed = JSON.parse(raw);
        answer = String(parsed.answer || "");
        action = parsed.action || null;
        provider = "openai";
        model = selectedModel;
      }
    }

    if (!answer) {
      const recent = logs ?? [];
      const weights = recent.map((x: any) => Number(x.body_weight_kg))
        .filter((x: number) => Number.isFinite(x));
      const average = (a: number[]) =>
        a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const current = weights[0] ?? Number(snapshot.weight ?? 90.5);
      const older = weights.slice(Math.min(7, weights.length));
      const trend = older.length ? current - Number(average(older)) : 0;
      const protein = Number(snapshot.protein ?? 0);
      const calories = Number(snapshot.calories ?? 0);

      if (trend < 0.1 && recent.length >= 7) {
        answer =
          "Your recent weight trend is below the planned 0.2–0.4 kg/week gain. Keep protein around 180 g/day and consider adding 150 kcal/day if this persists for two weeks.";
        action = {
          action_type: "calorie_target",
          title: "Propose +150 kcal/day",
          rationale: "Recent trend is below the target gain range.",
          proposed_value: { delta_kcal: 150 },
        };
      } else if (protein < 170) {
        answer =
          "Protein is currently below the ~180 g/day target. Add a convenient high-protein serving today, such as whey, paneer, tofu, soy or curd.";
        action = {
          action_type: "protein_target",
          title: "Close today's protein gap",
          rationale: "Current protein is below target.",
          proposed_value: { target_g: 180 },
        };
      } else if (calories < 2850) {
        answer =
          "Calories are currently below the starting target. Add a balanced meal or carbohydrate-rich snack rather than trying to compensate tomorrow.";
      } else {
        answer =
          "Your current data looks broadly on track. Keep the plan steady and let the weekly trend—not a single day—drive changes.";
      }
    }

    const { data: run } = await supabase.from("rmc_coach_runs").insert({
      user_id: user.id,
      question,
      input_snapshot: context,
      answer,
      provider,
      model,
    }).select("id").single();

    if (action && run?.id) {
      await supabase.from("rmc_coach_actions").insert({
        user_id: user.id,
        coach_run_id: run.id,
        action_type: action.action_type,
        title: action.title,
        rationale: action.rationale,
        proposed_value: action.proposed_value,
        status: "proposed",
      });
    }

    return json({ answer, action, provider, model, run_id: run?.id ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
