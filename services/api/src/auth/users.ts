import { randomUUID } from "node:crypto";

export const ROLES = ["passenger", "driver", "admin"] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export type NewUser = Omit<User, "id" | "createdAt">;

export class EmailTakenError extends Error {
  constructor() {
    super("Email already registered");
  }
}

/**
 * Where users are stored. The API only talks to this interface, so the
 * in-memory version below can be swapped for a Postgres one later.
 */
export interface UserRepository {
  /** Throws EmailTakenError if the email is already used. */
  create(input: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();

  async create(input: NewUser): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (await this.findByEmail(email)) throw new EmailTakenError();
    const user: User = { ...input, email, id: randomUUID(), createdAt: new Date() };
    this.byId.set(user.id, user);
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const wanted = email.trim().toLowerCase();
    return [...this.byId.values()].find((u) => u.email === wanted);
  }

  async findById(id: string): Promise<User | undefined> {
    return this.byId.get(id);
  }
}
