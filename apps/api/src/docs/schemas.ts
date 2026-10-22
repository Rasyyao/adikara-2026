import type { SchemaObject } from "../routes/types.js";

export const ref = (name: keyof typeof schemas): SchemaObject => ({ $ref: `#/components/schemas/${name}` });

/** Shared response/request shapes. Keep in sync with the service return types. */
export const schemas = {
  ErrorResponse: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", example: "validation_error" },
          message: { type: "string", example: "Request validation failed" },
          details: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  PublicUser: {
    type: "object",
    required: ["id", "role", "name"],
    properties: {
      id: { type: "string", format: "uuid" },
      role: { type: "string", enum: ["ADMIN", "TEACHER", "USER"] },
      name: { type: "string", nullable: true },
    },
  },
  LoginResult: {
    type: "object",
    required: ["access_token", "token_type", "expires_in", "user"],
    properties: {
      access_token: { type: "string", description: "JWT. Send as `Authorization: Bearer <token>`." },
      token_type: { type: "string", enum: ["Bearer"] },
      expires_in: { type: "integer", description: "Lifetime in seconds.", example: 3600 },
      user: { $ref: "#/components/schemas/PublicUser" },
    },
  },
  TeacherLoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      password: { type: "string", maxLength: 72, format: "password" },
    },
  },
  StudentLoginRequest: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", pattern: "^[a-z0-9_.-]{3,32}$", description: "Case-insensitive." },
      password: { type: "string", maxLength: 72, format: "password" },
    },
  },
  MeResponse: {
    type: "object",
    required: ["user"],
    properties: { user: { $ref: "#/components/schemas/PublicUser" } },
  },
  SessionView: {
    type: "object",
    required: ["id", "class_id", "join_code", "status", "locked", "started_at", "ended_at", "expires_at", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      class_id: { type: "string", format: "uuid" },
      join_code: { type: "string", nullable: true, description: "The 6-digit PIN. `null` once the session has ended.", example: "482913" },
      status: { type: "string", enum: ["LOBBY", "ACTIVE", "ENDED"] },
      locked: { type: "boolean", description: "When true, new students cannot join (students already in can still come back)." },
      started_at: { type: "string", format: "date-time", nullable: true },
      ended_at: { type: "string", format: "date-time", nullable: true },
      expires_at: { type: "string", format: "date-time", description: "The session closes by itself at this time." },
      created_at: { type: "string", format: "date-time" },
    },
  },
  LiveSession: {
    type: "object",
    required: ["session", "class_name", "joined_count"],
    properties: {
      session: { $ref: "#/components/schemas/SessionView" },
      class_name: { type: "string", example: "X RPL 1" },
      joined_count: { type: "integer", description: "Students currently in the session (kicked ones excluded)." },
    },
  },
  LiveSessionList: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: { $ref: "#/components/schemas/LiveSession" } } },
  },
  StudentSessionView: {
    type: "object",
    required: ["id", "class_id", "status", "locked", "started_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      class_id: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["LOBBY", "ACTIVE", "ENDED"] },
      locked: { type: "boolean" },
      started_at: { type: "string", format: "date-time", nullable: true },
    },
  },
  ParticipantView: {
    type: "object",
    required: ["student_id", "name", "username", "state", "joined_at", "left_at", "kicked_at"],
    properties: {
      student_id: { type: "string", format: "uuid" },
      name: { type: "string", nullable: true },
      username: { type: "string", nullable: true },
      state: { type: "string", enum: ["joined", "left", "kicked"] },
      joined_at: { type: "string", format: "date-time" },
      left_at: { type: "string", format: "date-time", nullable: true },
      kicked_at: { type: "string", format: "date-time", nullable: true },
    },
  },
  SessionDetail: {
    type: "object",
    required: ["session", "participants"],
    properties: {
      session: { $ref: "#/components/schemas/SessionView" },
      participants: { type: "array", items: { $ref: "#/components/schemas/ParticipantView" } },
    },
  },
  SessionResponse: {
    type: "object",
    required: ["session"],
    properties: { session: { $ref: "#/components/schemas/SessionView" } },
  },
  ParticipantResponse: {
    type: "object",
    required: ["participant"],
    properties: { participant: { $ref: "#/components/schemas/ParticipantView" } },
  },
  Attendance: {
    type: "object",
    required: ["session_id", "class_id", "summary", "students"],
    properties: {
      session_id: { type: "string", format: "uuid" },
      class_id: { type: "string", format: "uuid" },
      summary: {
        type: "object",
        required: ["present", "late", "absent", "kicked", "total"],
        properties: {
          present: { type: "integer" },
          late: { type: "integer", description: "Joined after the teacher pressed Start." },
          absent: { type: "integer" },
          kicked: { type: "integer" },
          total: { type: "integer" },
        },
      },
      students: {
        type: "array",
        items: {
          type: "object",
          required: ["student_id", "name", "username", "status", "joined_at"],
          properties: {
            student_id: { type: "string", format: "uuid" },
            name: { type: "string", nullable: true },
            username: { type: "string", nullable: true },
            status: { type: "string", enum: ["present", "late", "absent", "kicked"] },
            joined_at: { type: "string", format: "date-time", nullable: true },
          },
        },
      },
    },
  },
  EndSessionResponse: {
    type: "object",
    required: ["session", "attendance"],
    properties: {
      session: { $ref: "#/components/schemas/SessionView" },
      attendance: { $ref: "#/components/schemas/Attendance" },
    },
  },
  JoinResult: {
    type: "object",
    required: ["session", "participant"],
    properties: {
      session: { $ref: "#/components/schemas/StudentSessionView" },
      participant: { $ref: "#/components/schemas/ParticipantView" },
    },
  },
  CreateSessionRequest: {
    type: "object",
    required: ["class_code"],
    properties: {
      class_code: { type: "string", pattern: "^[A-Z0-9_-]{3,32}$", description: "The class code of one of the teacher's classes. Case-insensitive.", example: "KELAS7A" },
    },
  },
  JoinSessionRequest: {
    type: "object",
    required: ["code"],
    properties: { code: { type: "string", pattern: "^\\d{6}$", description: "The PIN shown by the teacher.", example: "482913" } },
  },
  LockRequest: {
    type: "object",
    required: ["locked"],
    properties: { locked: { type: "boolean" } },
  },
  TeacherView: {
    type: "object",
    required: ["id", "email", "name", "role", "class_count", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      email: { type: "string", format: "email" },
      name: { type: "string" },
      role: { type: "string", enum: ["TEACHER"] },
      class_count: { type: "integer", description: "Classes assigned to this teacher." },
      created_at: { type: "string", format: "date-time" },
    },
  },
  TeacherResponse: {
    type: "object",
    required: ["teacher"],
    properties: { teacher: { $ref: "#/components/schemas/TeacherView" } },
  },
  TeacherPage: {
    type: "object",
    required: ["items", "total", "limit", "offset"],
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/TeacherView" } },
      total: { type: "integer" },
      limit: { type: "integer" },
      offset: { type: "integer" },
    },
  },
  CreateTeacherRequest: {
    type: "object",
    required: ["email", "name", "password"],
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      name: { type: "string", minLength: 1, maxLength: 100 },
      password: { type: "string", format: "password", minLength: 8, maxLength: 72, description: "At least one letter and one digit." },
    },
  },
  UpdateTeacherRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      name: { type: "string", minLength: 1, maxLength: 100 },
      password: { type: "string", format: "password", minLength: 8, maxLength: 72 },
    },
  },
  ClassView: {
    type: "object",
    required: ["id", "name", "class_code", "teacher", "archived", "student_count", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      class_code: { type: "string", example: "KELAS7A" },
      teacher: {
        type: "object",
        required: ["id", "name"],
        properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } },
      },
      archived: { type: "boolean" },
      student_count: { type: "integer" },
      created_at: { type: "string", format: "date-time" },
    },
  },
  ClassStudent: {
    type: "object",
    required: ["id", "username", "name"],
    properties: {
      id: { type: "string", format: "uuid" },
      username: { type: "string", nullable: true },
      name: { type: "string", nullable: true },
    },
  },
  ClassResponse: {
    type: "object",
    required: ["class"],
    properties: { class: { $ref: "#/components/schemas/ClassView" } },
  },
  ClassList: {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: { $ref: "#/components/schemas/ClassView" } } },
  },
  ClassPage: {
    type: "object",
    required: ["items", "total", "limit", "offset"],
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/ClassView" } },
      total: { type: "integer" },
      limit: { type: "integer" },
      offset: { type: "integer" },
    },
  },
  ClassDetail: {
    type: "object",
    required: ["class", "students"],
    properties: {
      class: { $ref: "#/components/schemas/ClassView" },
      students: { type: "array", items: { $ref: "#/components/schemas/ClassStudent" } },
    },
  },
  CreateClassRequest: {
    type: "object",
    required: ["name", "class_code", "teacher_id"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      class_code: { type: "string", pattern: "^[A-Z0-9_-]{3,32}$", description: "Case-insensitive; stored in upper case. Cannot be changed later." },
      teacher_id: { type: "string", format: "uuid", description: "The teacher who teaches this class." },
    },
  },
  UpdateClassRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      teacher_id: { type: "string", format: "uuid", description: "Assigns the class to another teacher." },
      archived: { type: "boolean" },
    },
  },
  StudentView: {
    type: "object",
    required: ["id", "username", "name", "class", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      username: { type: "string", nullable: true },
      name: { type: "string", nullable: true },
      class: {
        type: "object",
        required: ["id", "name", "class_code"],
        properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, class_code: { type: "string" } },
      },
      created_at: { type: "string", format: "date-time" },
    },
  },
  StudentResponse: {
    type: "object",
    required: ["student"],
    properties: { student: { $ref: "#/components/schemas/StudentView" } },
  },
  StudentPage: {
    type: "object",
    required: ["items", "total", "limit", "offset"],
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/StudentView" } },
      total: { type: "integer" },
      limit: { type: "integer" },
      offset: { type: "integer" },
    },
  },
  CreateStudentRequest: {
    type: "object",
    required: ["username", "name", "password", "class_id"],
    properties: {
      username: { type: "string", pattern: "^[a-z0-9_.-]{3,32}$", description: "Case-insensitive; stored in lower case." },
      name: { type: "string", minLength: 1, maxLength: 100 },
      password: { type: "string", format: "password", minLength: 8, maxLength: 72, description: "At least one letter and one digit." },
      class_id: { type: "string", format: "uuid", description: "The class the student belongs to." },
    },
  },
  UpdateStudentRequest: {
    type: "object",
    minProperties: 1,
    properties: {
      username: { type: "string", pattern: "^[a-z0-9_.-]{3,32}$" },
      name: { type: "string", minLength: 1, maxLength: 100 },
      password: { type: "string", format: "password", minLength: 8, maxLength: 72 },
      class_id: { type: "string", format: "uuid", description: "Moves the student to another class." },
    },
  },
} as const satisfies Record<string, SchemaObject>;
