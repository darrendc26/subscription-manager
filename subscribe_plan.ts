import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { SolanaSubscriptionManager } from "./target/types/solana_subscription_manager";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Load keypair from file
const secret = JSON.parse(
  fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")
);
const keypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(secret));

// Load subscriber's wallet
const subSecret = JSON.parse(fs.readFileSync(`~C:/Users/user/.config/solana/id2.json`, "utf-8"));
const subKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(subSecret));


// Set up provider
const connection = new anchor.web3.Connection("https://solana-devnet.g.alchemy.com/v2/YOUR_API_KEY", "confirmed");

// Connect to devnet
const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection("https://solana-devnet.g.alchemy.com/v2/YOUR_API_KEY", "confirmed"),
  new anchor.Wallet(subKeypair),
  { commitment: "confirmed" }
);
anchor.setProvider(provider);

async function createSubscriberAssociatedTokenAccount() {
  const subscriber = subKeypair.publicKey; 
  const tokenMint = new PublicKey("TOKEN_MINT_ADDRESS");

  const subscriberAta = await getAssociatedTokenAddress(tokenMint, subscriber);

  const ataInfo = await provider.connection.getAccountInfo(subscriberAta);

  if (!ataInfo) {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        subscriberAta,
        subscriber,
        tokenMint
      )
    );

    const sig = await provider.sendAndConfirm(tx, [keypair]);
    console.log("✅ Subscriber ATA created:", sig);
  } else {
    console.log("✅ Subscriber ATA already exists:", subscriberAta.toBase58());
  }
}

async function createAssociatedTokenAccount() {
  const creator = keypair.publicKey;
  const tokenMint = new PublicKey("TOKEN_MINT_ADDRESS");

  const creatorAta = await getAssociatedTokenAddress(tokenMint, creator);

  const ataInfo = await provider.connection.getAccountInfo(creatorAta);

  if (!ataInfo) {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        keypair.publicKey, // payer
        creatorAta,
        creator,
        tokenMint
      )
    );

    const sig = await provider.sendAndConfirm(tx, [keypair]);
    console.log("✅ Creator ATA created:", sig);
  } else {
    console.log("✅ Creator ATA already exists:", creatorAta.toBase58());
  }
}

const IDL = require("./target/idl/solana_subscription_manager.json");
const PROGRAM_ID = new PublicKey("PROGRAM_ID");

// Init program
const program = anchor.workspace.solanaSubscriptionManager as Program<SolanaSubscriptionManager>;

async function subscribeToPlan(planAddress: string) {
  // Use the same subscriber consistently
  const subscriber = subKeypair.publicKey; // Use keypair's public key consistently
  
  console.log("Subscriber Public Key:", subscriber.toBase58());
  const planPubkey = new PublicKey(planAddress);

  const planAccount = await program.account.plan.fetch(planPubkey);
  const tokenMint = planAccount.tokenMint;
  const creator = planAccount.creator;

  const subscriberAta = await getAssociatedTokenAddress(tokenMint, subscriber);
  const creatorAta = await getAssociatedTokenAddress(tokenMint, creator);

  const creatorAtaInfo = await provider.connection.getAccountInfo(creatorAta);
  const subscriberAtaInfo = await provider.connection.getAccountInfo(subscriberAta);

  if (!creatorAtaInfo) throw new Error("Creator ATA not found");
  if (!subscriberAtaInfo) throw new Error("Subscriber ATA not found");

  // PDA derivation - now consistent with subscriber
  const [subscriptionPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("subscriber"), subscriber.toBuffer(), planPubkey.toBuffer()],
    program.programId
  );
  
  console.log("Subscriber:", subscriber.toBase58());
  console.log("Subscription PDA:", subscriptionPDA.toBase58());

  const [delegatePda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), subscriber.toBuffer()],
    program.programId
  );

  const amount = planAccount.price;
  // console.log("Amount:", amount);

  console.log(TOKEN_PROGRAM_ID.toBase58());

  // Uncomment this if you want to set up a delegate PDA
  // const delegateInstruction = await program.methods.setupDelegate(new anchor.BN(amount))
  //     .accounts({
  //       subscriber: subscriber,
  //       plan: planPubkey,
  //       subscription: subscriptionPDA,
  //       subscriberAta: subscriberAta,
  //       delegatePda: delegatePda,
  //       systemProgram: SystemProgram.programId,
  //     } as any).instruction();


  const tx = await program.methods.subscribe()
    .accounts({
      subscriber: subscriber,
      subscription: subscriptionPDA,
      plan: planPubkey,
      creatorAta,
      subscriberAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    } as any)
    // Uncomment the next line if you want to include the delegate instruction
    //  .postInstructions([delegateInstruction])              
    .signers([subKeypair])
    .rpc();

  console.log("✅ Subscribed to plan!");
  console.log("🔗 TX:", tx);
  console.log("📄 Subscription PDA:", subscriptionPDA.toBase58());
}

async function cancelSubscription(planAddress: string) {
    const planPubkey = new PublicKey(planAddress);

const [subscriptionPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("subscriber"), subKeypair.publicKey.toBuffer(), planPubkey.toBuffer()],
    program.programId
  );

const subscriptionAccountInfo = await provider.connection.getAccountInfo(subscriptionPDA);

console.log("Subscription PDA:", subscriptionPDA.toBase58());
console.log( subscriptionAccountInfo);

if (!subscriptionAccountInfo || subscriptionAccountInfo.data.length === 0) {
  console.log("❌ Subscription account does not exist or is uninitialized. Nothing to cancel.");
} else {
try{
await program.methods.cancelSubscription()
  .accounts({
    subscription: subscriptionPDA,
    plan: planPubkey,
    subscriber: subKeypair.publicKey,
  })
  .signers([subKeypair])
  .rpc();
}catch (error) {
  console.error("❌ Error canceling subscription:", error);
  return;
}
}
}
//  cancelSubscription("EiC2NCc1dAgsGV71aSorqp7kx1LRXmoTRc13CUw4U7QB").catch(console.error);
   createSubscriberAssociatedTokenAccount().catch(console.error);
   createAssociatedTokenAccount().catch(console.error);
   subscribeToPlan("PLAN_ADDRESS").catch(console.error);
