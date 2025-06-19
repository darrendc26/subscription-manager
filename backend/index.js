import express from "express";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

app.post("/subscription-due", async(req, res) => {
    const { subscriber, subscriptionPDA, planPDA, amount } = req.body;
    const email = "abcxyz@gmail.com";
    const payment_link = `${FRONTEND_URL}?subscriber=${subscriber}&plan=${planPDA}&sub=${subscriptionPDA}&amt=${amount}`;

    const transporter = nodemailer.createTransport({
        service:"gmail",
        auth:{
            user:process.env.EMAIL_ID,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const mail = {
        from: process.env.EMAIL_ID,
        to: email,
        subject: "Action Required: Subscription Payment Due...",
        html:`
        <p> Your subscription is due. Please click on the link below to confirm your pament. </p>
        <a href="${payment_link}"> Pay Now <a>
        `
    }

    try {
        await transporter.sendMail(mail);
        res.send("Email sent");
    } catch(err){
        console.log(err);
        res.send("Failed to send email")
    }
    
});


app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
