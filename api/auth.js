import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SB_URL,
  process.env.SB_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, email, password, name } = req.body;

  if (action === "login") {
    // Check admins
    const { data: admins } = await supabase.from("admins").select("*").eq("email", email);
    if (admins?.length) {
      const match = await bcrypt.compare(password, admins[0].password_hash || "");
      if (match) return res.status(200).json({ role: "admin", user: admins[0] });
      // Fallback: check plain text password for migration
      if (admins[0].password === password) return res.status(200).json({ role: "admin", user: admins[0] });
    }

    // Check students
    const { data: students } = await supabase.from("students").select("*").eq("email", email);
    if (students?.length) {
      const match = await bcrypt.compare(password, students[0].password_hash || "");
      if (match) return res.status(200).json({ role: "student", user: students[0] });
      // Fallback: check plain text password for migration
      if (students[0].password === password) return res.status(200).json({ role: "student", user: students[0] });
    }

    return res.status(401).json({ error: "Incorrect email or password." });
  }

  if (action === "signup") {
    // Check if email exists
    const { data: existing } = await supabase.from("students").select("id").eq("email", email);
    if (existing?.length) return res.status(400).json({ error: "An account with this email already exists." });

    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from("students").insert([{
      name, email,
      password: password, // keep for fallback
      password_hash: hash,
      status: "active",
      enrolled_courses: [],
      join_date: new Date().toISOString().slice(0, 10),
      progress: {}
    }]).select();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ user: data[0] });
  }

  return res.status(400).json({ error: "Unknown action" });
}
