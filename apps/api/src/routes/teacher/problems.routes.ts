import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseCheck, parseGenerate, parseMaterialQuery, parseNewProblem, parseProblemStatus, parseProblemUpdate, parseRegenerate } from "../../http/validators/teacher/problem.js";
import { MAX_GENERATE, type TeacherProblemService } from "../../services/teacher/problem.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const NOT_FOUND = errorDoc("problem_not_found", "No such problem, or it belongs to another teacher.", "Problem not found");
const MATERIAL_NOT_FOUND = errorDoc("material_not_found", "No such material (chat), or it belongs to another teacher.", "Material not found");
const GENERATING = errorDoc("problem_generating", "The AI is still writing this problem; wait until `generation` is no longer `pending`.", "The AI is still writing this problem");
const CHALLENGE_EXAMPLE = {
  prompt: "Susun langkah robot sampai ke bendera.",
  hint: "Robot harus belok sebelum maju lagi.",
  ordered: true,
  blocks: [
    { id: "b1", kind: "event", text: "ketika mulai" },
    { id: "b2", kind: "loop", text: "ulangi 3 kali" },
    { id: "b3", kind: "action", text: "maju 1 langkah" },
    { id: "b4", kind: "action", text: "lompat" },
  ],
  solution: [{ block: "b1" }, { block: "b2", children: [{ block: "b3" }] }],
  code: {
    fn: "langkahKeBendera",
    params: ["jarak"],
    starter: "function langkahKeBendera(jarak) {\n  \n}\n",
    reference: "function langkahKeBendera(jarak) {\n  return jarak;\n}\n",
    tests: [{ args: [3], expected: 3 }],
  },
};

export function teacherProblemRoutes(service: TeacherProblemService): RouteGroup {
  return {
    role: "teacher",
    feature: "problems",
    description:
      "Problem-solving drafts: a story and one challenge, solved with blocks and/or JavaScript. For blocks the teacher arranges the answer; " +
      "blocks left out are distractors and students rebuild the answer from the shuffled blocks. For JavaScript the student writes a function " +
      "that must pass the teacher's test cases.",
    routes: [
      {
        method: "get",
        path: "/problems",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.list(requireAuth(req), parseMaterialQuery(req.query.material)));
        },
        doc: {
          summary: "My problem drafts",
          description:
            "Newest change first; an admin gets every teacher's. `issues` counts what is unfinished; `answer_blocks` counts the answer key; `modes` says blocks and/or code; " +
            "`material` is the material it belongs to; `generation` is `pending` while the AI writes it and `failed` when it could not.",
          query: [{ name: "material", description: "Only this material's problems (its chat id), or `none` for those without one.", schema: { type: "string" } }],
          responses: { 200: { description: "The problems", schema: { type: "object" } } },
        },
      },
      {
        method: "get",
        path: "/problems/materials",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.materials(requireAuth(req)));
        },
        doc: {
          summary: "Materials to make problems from",
          description: "The caller's materials (chats), newest first: files read (`ready_files`), files still being read (`pending_files`) and how many problems belong to each.",
          responses: { 200: { description: "The materials", schema: { type: "object" } } },
        },
      },
      {
        method: "post",
        path: "/problems/generate",
        access: "staff",
        handler: async (req, res) => {
          res.status(202).json(await service.generate(requireAuth(req), parseGenerate(req.body, MAX_GENERATE)));
        },
        doc: {
          summary: "Let the AI draft problems from a material",
          description:
            `Creates 1-${MAX_GENERATE} drafts with \`generation: "pending"\` and queues one \`generate_problem\` job each. The worker reads the whole ` +
            "material and fills in the story and the challenge; poll the problem until `generation` is null (done) or `failed` (`generation_error` says why). " +
            "`focus` narrows it to a topic of the material.",
          requestBody: { schema: { type: "object", required: ["material_id"] }, example: { material_id: "6f1c2a4e-1b7d-4c55-9a51-0f1f2b3c4d5e", focus: "perulangan for", count: 2 } },
          responses: {
            202: { description: "The pending drafts", schema: { type: "object" } },
            404: MATERIAL_NOT_FOUND,
            409: errorDoc("material_not_ready", "No file of the material has been read yet; `details.pending_files` counts those still being read.", "The material has no file that has been read yet"),
          },
        },
      },
      {
        method: "post",
        path: "/problems",
        access: "staff",
        handler: async (req, res) => {
          res.status(201).json(await service.create(requireAuth(req), parseNewProblem(req.body)));
        },
        doc: {
          summary: "Start a problem draft",
          description: "Starts with a default instruction, no blocks and no JavaScript task yet.",
          requestBody: { schema: { type: "object", required: ["title"] }, example: { title: "Robot ke bendera", story: "Robot harus sampai ke bendera tanpa menabrak batu." } },
          responses: { 201: { description: "The new draft", schema: { type: "object" } } },
        },
      },
      {
        method: "get",
        path: "/problems/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.get(requireAuth(req), parseUuidParam(req.params.id, "id")));
        },
        doc: {
          summary: "A problem with its answer key",
          description: "The challenge with its blocks, `solution` and `code` (JavaScript task with `reference` and `tests`, or null). `issues` lists what is unfinished (`story_missing`, `prompt_missing`, `no_mode`, `solution_missing`, `container_empty`, `code_tests_missing`).",
          responses: { 200: { description: "The problem", schema: { type: "object" } }, 404: NOT_FOUND },
        },
      },
      {
        method: "put",
        path: "/problems/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.update(requireAuth(req), parseUuidParam(req.params.id, "id"), parseProblemUpdate(req.body)));
        },
        doc: {
          summary: "Save a problem draft",
          description:
            "Replaces title, story and the challenge. A block in `solution` is used at most once; only `loop` and `if` blocks hold `children`. `code` null turns JavaScript off. " +
            "`material_id` moves it to another material (null: none; left out: unchanged). A ready problem saved with something unfinished goes back to draft.",
          requestBody: { schema: { type: "object", required: ["title", "challenge"] }, example: { title: "Robot ke bendera", story: "…", challenge: CHALLENGE_EXAMPLE } },
          responses: { 200: { description: "The saved problem", schema: { type: "object" } }, 404: NOT_FOUND, 409: GENERATING },
        },
      },
      {
        method: "post",
        path: "/problems/:id/status",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.setStatus(requireAuth(req), parseUuidParam(req.params.id, "id"), parseProblemStatus(req.body)));
        },
        doc: {
          summary: "Mark a problem ready, or back to draft",
          requestBody: { schema: { type: "object", required: ["status"] }, example: { status: "ready" } },
          responses: {
            200: { description: "The problem", schema: { type: "object" } },
            404: NOT_FOUND,
            409: errorDoc("problem_incomplete", "Something is unfinished; `details.issues` says what.", "The problem is not finished"),
          },
        },
      },
      {
        method: "post",
        path: "/problems/:id/regenerate",
        access: "staff",
        handler: async (req, res) => {
          const { focus } = parseRegenerate(req.body);
          res.status(202).json(await service.regenerate(requireAuth(req), parseUuidParam(req.params.id, "id"), focus));
        },
        doc: {
          summary: "Let the AI make a problem again",
          description: "For a problem that belongs to a material: replaces its story and challenge with a new AI draft. `focus` left out keeps the previous one.",
          requestBody: { schema: { type: "object" }, example: { focus: "percabangan" } },
          responses: {
            202: { description: "The pending draft", schema: { type: "object" } },
            404: NOT_FOUND,
            409: errorDoc("problem_without_material", "Not attached to a material, the material has no read file (`material_not_ready`), or the AI is still writing it (`problem_generating`).", "Only a problem that belongs to a material can be made by the AI"),
          },
        },
      },
      {
        method: "post",
        path: "/problems/:id/duplicate",
        access: "staff",
        handler: async (req, res) => {
          res.status(201).json(await service.duplicate(requireAuth(req), parseUuidParam(req.params.id, "id")));
        },
        doc: {
          summary: "Copy a problem",
          description: "The copy is a draft owned by the caller.",
          requestBody: { schema: { type: "object" }, example: {}, description: "No body needed." },
          responses: { 201: { description: "The copy", schema: { type: "object" } }, 404: NOT_FOUND },
        },
      },
      {
        method: "delete",
        path: "/problems/:id",
        access: "staff",
        handler: async (req, res) => {
          await service.remove(requireAuth(req), parseUuidParam(req.params.id, "id"));
          res.status(204).end();
        },
        doc: { summary: "Delete a problem", responses: { 204: { description: "Deleted" }, 404: NOT_FOUND } },
      },
      {
        method: "post",
        path: "/problems/:id/check",
        access: "staff",
        handler: async (req, res) => {
          const { answer } = parseCheck(req.body);
          res.json(await service.check(requireAuth(req), parseUuidParam(req.params.id, "id"), answer));
        },
        doc: {
          summary: "Try the blocks as a student",
          description:
            "Grades a block arrangement. `blocks` says per placed block `right`, `misplaced` (the answer needs it elsewhere) or `extra` " +
            "(a distractor); `missing` counts answer blocks not placed yet.",
          requestBody: { schema: { type: "object", required: ["answer"] }, example: { answer: [{ block: "b1" }, { block: "b2", children: [{ block: "b3" }] }] } },
          responses: { 200: { description: "The grade", schema: { type: "object" } }, 404: NOT_FOUND },
        },
      },
    ],
  };
}
