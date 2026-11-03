import type pg from "pg";
import {
  EmailTakenError,
  type NewUser,
  type Role,
  type User,
  type UserRepository,
} from "./users.js";

interface UserRow {
  id: string;
  role: Role;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  role: row.role,
  name: row.name,
  email: row.email,
  passwordHash: row.password_hash,
  createdAt: row.created_at,
});

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: NewUser): Promise<User> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `insert into users (role, name, email, password_hash)
         values ($1, $2, $3, $4) returning *`,
        [input.role, input.name, input.email.trim().toLowerCase(), input.passwordHash],
      );
      return toUser(rows[0]!);
    } catch (err) {
      // 23505 = unique violation: the email is already taken
      if ((err as { code?: string }).code === "23505") throw new EmailTakenError();
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      "select * from users where lower(email) = lower($1)",
      [email.trim()],
    );
    return rows[0] && toUser(rows[0]);
  }

  async findById(id: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>("select * from users where id = $1", [id]);
    return rows[0] && toUser(rows[0]);
  }
}
