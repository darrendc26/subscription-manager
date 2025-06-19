// Authorise a delegate for a subscriber in the Solana Subscription Manager program
// Use only if u need to authorise a delegate for a subscriber

import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import * as bs58 from 'bs58';

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { SolanaSubscriptionManager } from "./target/types/solana_subscription_manager";

// Load the keypair
const secretKey = JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8"));
const crankKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secretKey));

// Load IDL
let IDL;
try {
  IDL = require("./target/idl/solana_subscription_manager.json");
} catch (error) {
  console.error("Failed to load IDL with require:", error);
  process.exit(1);
}

const PROGRAM_ID = new PublicKey(IDL.address);

const wallet = crankKeypair;
const connection = new Connection("https://api.devnet.solana.com", { commitment: "confirmed" });

// Create provider without using AnchorProvider to avoid workspace issues
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(wallet),
  { commitment: "confirmed" }
);

// Set the provider globally to avoid workspace loading
anchor.setProvider(provider);

// Initialize program directly without relying on workspace
// let program;
// try {
//   // Create program instance directly
//   const program = anchor.workspace.solanaSubscriptionManager as Program<SolanaSubscriptionManager>;
//   console.log("Program initialized successfully");
// //   console.log("Program ID:", program.programId.toString());
// } catch (error) {
//   console.error("Failed to initialize program:", error);
// }

export async function authoriseDelegate(subscriberPublicKey: PublicKey, planPublicKey: PublicKey, amount: number) {
  const program = anchor.workspace.solanaSubscriptionManager as Program<SolanaSubscriptionManager>;
  console.log("Authorising delegate...");

  // Get the associated token address for the subscriber
  const subscriberAta = await getAssociatedTokenAddress(
    TOKEN_PROGRAM_ID,
    subscriberPublicKey
  );

  // Derive the delegate PDA
  const [delegatePda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), subscriberPublicKey.toBuffer()],
    program.programId
  );

  console.log("Delegate PDA:", delegatePda.toString());

  // Call the setup_delegate instruction
  try {
    const tx = await program.methods.setupDelegate(new anchor.BN(amount))
      .accounts({
        subscriber: subscriberPublicKey,
        subscriberAta: subscriberAta,
        delegatePda: delegatePda,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([wallet])
      .rpc();

    console.log("Delegate authorised successfully. Transaction signature:", tx);
  } catch (error) {
    console.error("Failed to authorise delegate:", error);
  }
}
