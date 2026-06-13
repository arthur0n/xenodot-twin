// mcp__ui__form: typed form composed by the agent (see PROTOCOL.md). Same
// lifecycle as renderAsk — card in chat, mini in panel, one reply.
import { el } from "./dom.js";
import { send } from "./websocket.js";
import { registerPending, settle, agentChip } from "./approvals.js";

/** @param {Extract<import("../lib/types.js").ServerMsg, { type: "form" }>} m */
export function renderForm(m) {
  const form = m.input ?? {};
  const fields = form.fields ?? [];
  /** @typedef {() => string | number | boolean | string[]} FieldReader */
  /** @type {Array<{ f: import("../lib/types.js").FormField, wrap: HTMLElement, read: FieldReader }>} */
  const readers = []; // per field: { f, wrap, read: () => current value }

  const chatCard = el("div", "card approval");
  const head = el("div", "card-head");
  const headChip = agentChip(m.agent);
  if (headChip) head.append(headChip, " ");
  head.append(form.title ?? "Form");
  const body = el("div", "approval-body");
  if (form.description) body.append(el("div", "form-desc", form.description));

  fields.forEach((f) => {
    const wrap = el("div", "form-field");

    if (f.type === "note") {
      if (f.label) wrap.append(el("div", "form-note-label", f.label));
      if (f.value != null) wrap.append(el("div", "form-note", String(f.value)));
      body.append(wrap);
      return; // read-only: no reader → never in values, never required
    }

    const clearInvalid = () => {
      wrap.classList.remove("invalid");
    };

    if (f.type === "checkbox") {
      const lab = el("label", "form-check");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = f.value === true;
      box.onchange = clearInvalid;
      lab.append(box, f.label ?? f.id);
      wrap.append(lab);
      readers.push({ f, wrap, read: () => box.checked });
    } else {
      const lab = el("label", "form-label", f.label ?? f.id);
      if (f.required) lab.append(el("span", "req", " *"));
      wrap.append(lab);

      if (f.type === "select" || f.type === "multiselect") {
        const row = el("div", "form-options");
        const initial = Array.isArray(f.value) ? f.value : f.value != null ? [f.value] : [];
        const picked = new Set(
          initial.map(String).filter((v) => (f.options ?? []).some((o) => o.label === v)),
        );
        (f.options ?? []).forEach((opt) => {
          const b = el("button", "btn" + (picked.has(opt.label) ? " primary" : ""), opt.label);
          if (opt.description) b.title = opt.description;
          b.onclick = () => {
            clearInvalid();
            if (f.type === "multiselect") {
              b.classList.toggle("primary");
              if (picked.has(opt.label)) picked.delete(opt.label);
              else picked.add(opt.label);
            } else {
              row.querySelectorAll(".btn").forEach((x) => {
                x.classList.remove("primary");
              });
              b.classList.add("primary");
              picked.clear();
              picked.add(opt.label);
            }
          };
          row.append(b);
        });
        wrap.append(row);
        readers.push({
          f,
          wrap,
          read: () => (f.type === "multiselect" ? [...picked] : ([...picked][0] ?? "")),
        });
      } else {
        const input = document.createElement(f.type === "textarea" ? "textarea" : "input");
        input.className = "form-input";
        if (f.type === "textarea") /** @type {HTMLTextAreaElement} */ (input).rows = 3;
        else /** @type {HTMLInputElement} */ (input).type = f.type === "number" ? "number" : "text";
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.value != null) input.value = String(f.value);
        input.oninput = clearInvalid;
        wrap.append(input);
        readers.push({
          f,
          wrap,
          read: () => {
            const v = input.value.trim();
            return f.type === "number" && v !== "" ? Number(v) : v;
          },
        });
      }
    }
    body.append(wrap);
  });

  const actions = el("div", "approval-actions");
  const submit = el("button", "btn primary", form.submitLabel ?? "Submit");
  submit.onclick = () => {
    const missing = readers.filter(({ f, read }) => {
      if (!f.required) return false;
      const v = read();
      return v === "" || v === false || (Array.isArray(v) && !v.length);
    });
    if (missing.length) {
      missing.forEach(({ wrap }) => {
        wrap.classList.add("invalid");
      });
      missing[0]?.wrap.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    /** @type {Record<string, string | number | boolean | string[]>} */
    const values = {};
    readers.forEach(({ f, read }) => (values[f.id] = read()));
    send({ type: "reply", id: m.id, payload: { values } });
    settle(m.id, "✓ Submitted");
  };
  const skip = el("button", "btn ghost", "Skip");
  skip.onclick = () => {
    send({ type: "reply", id: m.id, payload: { cancelled: true } });
    settle(m.id, "✕ Skipped", true);
  };
  actions.append(submit, skip);
  body.append(actions);
  chatCard.append(head, body, el("div", "approval-resolved"));

  // Panel mini: passive pointer to the chat card
  const panelCard = el("div", "approval-mini");
  const miniRow = el("div", "approval-mini-row");
  const rowChip = agentChip(m.agent);
  if (rowChip) miniRow.append(rowChip, " ");
  miniRow.append(`📋 ${(form.title ?? "form").slice(0, 60)}`);
  panelCard.append(miniRow);
  const jump = el("button", "btn", "Fill in chat →");
  jump.onclick = () => {
    chatCard.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  panelCard.append(jump);

  registerPending(m.id, chatCard, panelCard);
}
