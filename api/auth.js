import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SB_URL,
  process.env.SB_SERVICE_KEY
);



export default async function handler(req) {
  const { action, email, password, name } = await req.json();

  if (action === "login") {
    const { data: admins } = await supabase.from("admins").select("*").eq("email", email);
    if (admins?.length) {
      const match = await bcrypt.compare(password, admins[0].password_hash || "");
      if (match) return Response.json({ role: "admin", user: admins[0] });
    }
    const { data: students } = await supabase.from("students").select("*").eq("email", email);
    if (students?.length) {
      const match = await bcrypt.compare(password, students[0].password_hash || "");
      if (match) return Response.json({ role: "student", user: students[0] });
    }
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  if (action === "signup") {
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from("students").insert([{
      name, email, password_hash: hash, status: "active",
      enrolled_courses: [], join_date: new Date().toISOString().slice(0, 10), progress: {}
    }]).select();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ user: data[0] });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
