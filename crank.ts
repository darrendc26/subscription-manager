import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { SolanaSubscriptionManager } from "./target/types/solana_subscription_manager";

// Load the keypair
const secretKey = JSON.parse(fs.readFileSync(`~C:/Users/user/.config/solana/id2.json`, "utf-8"));
const crankKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secretKey));

const subSecret = JSON.parse(fs.readFileSync(`~C:/Users/user/.config/solana/id2.json`, "utf-8"));
const subKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(subSecret));

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


async function runCrank() {
    const now = Math.floor(Date.now() / 1000);
    const program = anchor.workspace.solanaSubscriptionManager as Program<SolanaSubscriptionManager>;
    console.log("Crank started...");
    console.log("Wallet:", wallet.publicKey.toString());

    const allSubs = await program.account.subscriber.all();
    
    console.log(`Found ${allSubs.length} subscriptions`);
    // console.log(allSubs);
    

    for (const { account, publicKey } of allSubs) {
        console.log(`\nChecking subscription: ${publicKey.toBase58()}`);
        console.log("Account data:", {
            subscriber: account.subscriber.toString(),
            plan: account.plan.toString(),
            isActive: account.isActive,
            lastChargedAt: account.lastChargedAt.toString(),
            nextChargeAt: account.nextChargeAt.toString(),
            createdAt: account.createdAt.toString(),
        });
        // console.log(account.plan)
        const planPubkey = account.plan;

        const planAccount = await program.account.plan.fetch(planPubkey);
        console.log("Token Mint:", planAccount.tokenMint.toString());
        
        const [delegatePda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("delegate"),
                account.subscriber.toBuffer(),
                // Add other seeds if your program uses them
            ],
            program.programId
        );

        const subscriberAta = await getAssociatedTokenAddress(
            planAccount.tokenMint,
            account.subscriber,
        );

        console.log("Subscriber ATA:", subscriberAta.toString());

        // // Authorise delegate
        const subscriberDelegate = await getAccount(connection,subscriberAta);
        console.log("Subscriber ATA:", subscriberDelegate);

        // Change to  account.isActive && account.nextChargeAt.toNumber() < now
        if( account.isActive && account.nextChargeAt.toNumber() < now){
            // console.log("Charging subscription:", account.subscriber.toString());
            const planAccount = await program.account.plan.fetch(planPubkey);
            const tokenMint = planAccount.tokenMint;
            const subscriber = account.subscriber;
            // console.log(subscriber)
            const subscriberAta = await getAssociatedTokenAddress(tokenMint, subscriber);
            // console.log("subscriberAta", subscriberAta)
            const creatorAta = await getAssociatedTokenAddress(tokenMint, planAccount.creator);
            // console.log("creatorAta", creatorAta)

            const tx = await program.methods.charge().accounts({
                subscriber: subscriber,
                subscription: publicKey,
                plan: planPubkey,
                creatorAta: creatorAta,
                subscriberAta: subscriberAta,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            } as any )
            .signers([subKeypair])
            .rpc();
            console.log("✅ Charged:", tx);
        }
        else {
            console.log("❌ Not time yet");
        }
    }
}

runCrank().catch((err) => {
    console.log(err);
});