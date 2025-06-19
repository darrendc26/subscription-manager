import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SolanaSubscriptionManager } from "./target/types/solana_subscription_manager";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const secret = JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8"));
const keypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(secret));

const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection("https://solana-devnet.g.alchemy.com/v2/YOUR_API_KEY", "confirmed"),
  new anchor.Wallet(keypair),
  { commitment: "confirmed" }
);

anchor.setProvider(provider);

const IDL = require("./target/idl/solana_subscription_manager.json");
const PROGRAM_ID = new PublicKey("YOUR PROGRAM ID");

const program = anchor.workspace.solanaSubscriptionManager as Program<SolanaSubscriptionManager>;

async function createPlan() {
  const creator = keypair.publicKey;

const tokenMint = new PublicKey(process.env.TOKEN_MINT_ADDRESS); 
  const name = "Premium Plan";
  const price = new anchor.BN(1000);
  const interval = new anchor.BN(86400); // 1 day

  const [planPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), creator.toBuffer()],
    program.programId
  );

  const tx = await program.methods
    .createPlan(name, tokenMint, price, interval)
    .accounts({
      plan: planPDA, // ✅ Required!
      creator: keypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    } as any)
    .signers([keypair])
    .rpc();

  console.log("✅ Plan created!");
  console.log("🧾 TX:", tx);
  console.log("📍 Plan PDA:", planPDA.toBase58());
}

createPlan().catch(console.error);
