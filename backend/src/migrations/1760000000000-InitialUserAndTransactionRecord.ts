import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialUserAndTransactionRecord1760000000000 implements MigrationInterface {
  name = "InitialUserAndTransactionRecord1760000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletAddress" character varying(128) NOT NULL,
        "email" character varying(128),
        "alias" character varying(128),
        "role" character varying(32) NOT NULL DEFAULT 'user',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_walletAddress" UNIQUE ("walletAddress"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('pending', 'completed', 'failed')`);
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "roundId" character varying(64) NOT NULL,
        "recipient" character varying(128) NOT NULL,
        "amount" character varying(64) NOT NULL,
        "token" character varying(128) NOT NULL,
        "timestamp" bigint NOT NULL,
        "txHash" character varying(128) NOT NULL,
        "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'pending',
        CONSTRAINT "UQ_transactions_txHash" UNIQUE ("txHash"),
        CONSTRAINT "PK_transactions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_transactions_tx_hash" ON "transactions" ("txHash")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_round_id" ON "transactions" ("roundId")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_recipient" ON "transactions" ("recipient")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_timestamp" ON "transactions" ("timestamp")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_timestamp"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_recipient"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_round_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_transactions_tx_hash"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
