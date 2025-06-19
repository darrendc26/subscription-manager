
#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_spl::token::{ TokenAccount, Transfer, Token };

declare_id!("GS2MPg4HWgjb3bk6db5x6gBBh3q3oPHxVhRT1VvxKamN");

#[program]
pub mod solana_subscription_manager {
    use super::*;

    pub fn create_plan(ctx: Context<CreatePlan>, name: String, token_mint: Pubkey, price: u64, interval: i64) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        let now = Clock::get()?.unix_timestamp;
        plan.creator = ctx.accounts.creator.key();
        plan.name = name;
        plan.token_mint = token_mint;
        plan.price = price;
        plan.interval = interval;
        plan.subscriber_count = 0;
        plan.bump = ctx.bumps.plan;
        plan.created_at = now;
        plan.is_active = true;

        emit!(PlanCreated {
            creator: ctx.accounts.creator.key(),
            plan: plan.key(),
            price: price,
            interval: interval,
            created_at: now,
        });
        Ok(())
    }

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        let plan = &mut ctx.accounts.plan;
        let subscriber = &ctx.accounts.subscriber;
        let now = Clock::get()?.unix_timestamp;
        require!(plan.is_active, ErrorCode::PlanInactive);
        subscription.subscriber = subscriber.key();
        subscription.plan = plan.key();
        subscription.bump = ctx.bumps.subscription;
        subscription.is_active = true;
        subscription.last_charged_at = now;
        subscription.next_charge_at = now + plan.interval;
        subscription.created_at = now;
        
        // Transfer tokens from subscriber to creator
        let cpi_accounts = Transfer {
            from: ctx.accounts.subscriber_ata.to_account_info(),
            to: ctx.accounts.creator_ata.to_account_info(),
            authority: subscriber.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, plan.price)?;

        plan.subscriber_count += 1;

        emit!(SubscriptionCreated {
            user: subscriber.key(),
            plan: plan.key(),
            timestamp: now,
        });

        Ok(())
    }
    
  pub fn charge(ctx: Context<Charge>) -> Result<()> {
    let subscription = &mut ctx.accounts.subscription;
    let plan = &mut ctx.accounts.plan;
    let now = Clock::get()?.unix_timestamp;
    
    // Basic validations
    require!(plan.is_active, ErrorCode::PlanInactive);
    require!(now >= subscription.next_charge_at, ErrorCode::NotTimeYet);
    require!(subscription.is_active, ErrorCode::SubscriptionInactive);
    
    // Transfer tokens from subscriber to creator
    let cpi_accounts = Transfer {
        from: ctx.accounts.subscriber_ata.to_account_info(),
        to: ctx.accounts.creator_ata.to_account_info(),
        authority: ctx.accounts.subscriber.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    anchor_spl::token::transfer(cpi_ctx, plan.price)?;
    
    // Update subscription timestamps
    subscription.last_charged_at = now;
    subscription.next_charge_at = now + plan.interval;
    
    emit!(SubscriptionCharged {
        user: subscription.subscriber,
        plan: plan.key(),
        timestamp: now,
    });
    
    Ok(())
}

// pub fn setup_delegate(ctx: Context<SetupDelegate>, amount: u64) -> Result<()> { 
//     let cpi_accounts = Approve {
//         to: ctx.accounts.subscriber_ata.to_account_info(),
//         delegate: ctx.accounts.delegate_pda.to_account_info(),
//         authority: ctx.accounts.subscriber.to_account_info(),
//     };
//     let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
//     anchor_spl::token::approve(cpi_ctx, amount)?;
//     Ok(())
// }
    
    pub fn cancel_subscription(ctx: Context<UpdateSubscription>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        let plan = &mut ctx.accounts.plan;
        subscription.is_active = false;
        plan.subscriber_count = plan.subscriber_count.saturating_sub(1);

        emit!(SubscriptionCancelled {
            user: subscription.subscriber,
            plan: plan.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_plan(ctx: Context<UpdatePlan>, new_name: Option<String>, new_token_mint: Option<Pubkey>, new_price: Option<u64>, new_interval: Option<i64>) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        require!(plan.creator == ctx.accounts.creator.key(), ErrorCode::Unauthorized);
        require!(plan.is_active, ErrorCode::PlanInactive);
        if let Some(name) = new_name {
            plan.name = name;
        }
        if let Some(token_mint) = new_token_mint {
            plan.token_mint = token_mint;
        }
        if let Some(price) = new_price {
            plan.price = price;
        }
        if let Some(interval) = new_interval {
            plan.interval = interval;
        }

        emit!(PlanUpdated {
            creator: plan.creator,
            plan: plan.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn pause_plan(ctx: Context<UpdatePlan>) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        plan.is_active = false;

        emit!(PlanPaused {
            creator: plan.creator,
            plan: plan.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn resume_plan(ctx: Context<UpdatePlan>) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        plan.is_active = true;

        emit!(PlanResumed {
            creator: plan.creator,
            plan: plan.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

}

#[derive(Accounts)]
pub struct CreatePlan<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + (4 + 50) + 32 + 8 + 8 + 4 + 1 + 8 + 1,
        seeds = [b"plan", creator.key().as_ref()],
        bump
    )]
    pub plan: Account<'info, Plan>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
     #[account(mut)]
    pub subscriber: Signer<'info>,

    #[account(
        init,
        payer = subscriber,
        space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8 ,
        seeds = [b"subscriber", subscriber.key().as_ref(), plan.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscriber>,

    #[account(
        mut,
        seeds = [b"plan", plan.creator.key().as_ref()],
        bump = plan.bump
    )]
    pub plan: Account<'info, Plan>,

    #[account(
        mut,
        constraint = creator_ata.owner == plan.creator,
        constraint = creator_ata.mint == plan.token_mint,
    )]
    pub creator_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = subscriber_ata.owner == subscriber.key(),
        constraint = subscriber_ata.mint == plan.token_mint,
    )]
    pub subscriber_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// #[derive(Accounts)]
// pub struct SetupDelegate<'info> {
//     #[account(mut)]
//     pub subscriber: Signer<'info>,
    
//     #[account(
//         mut,
//         has_one = subscriber,
//         seeds = [b"subscriber", subscriber.key().as_ref(), plan.key().as_ref()],
//         bump = subscription.bump,
//     )]
//     pub subscription: Account<'info, Subscriber>,
    
//     #[account(
//         seeds = [b"plan", plan.creator.key().as_ref()],
//         bump = plan.bump
//     )]
//     pub plan: Account<'info, Plan>,
    
//     /// CHECK: PDA used as delegate authority for token transfers
//     #[account(
//         seeds = [b"delegate", subscription.subscriber.as_ref()],
//         bump,
//     )]
//     pub delegate_pda: AccountInfo<'info>,
    
//     #[account(
//         mut,
//         constraint = subscriber_ata.owner == subscriber.key(),
//         constraint = subscriber_ata.mint == plan.token_mint,
//     )]
//     pub subscriber_ata: Account<'info, TokenAccount>,
    
//     pub token_program: Program<'info, Token>,
//     pub system_program: Program<'info, System>,
// }


#[derive(Accounts)]
pub struct Charge<'info> {
    /// CHECK: Subscriber account (crank will call this, not the subscriber)
    pub subscriber: AccountInfo<'info>,
    
    #[account(mut)]
    pub crank_operator: Signer<'info>,
    
    #[account(
        mut,
        has_one = subscriber,
        seeds = [b"subscriber", subscriber.key().as_ref(), plan.key().as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscriber>, 
    
    #[account(
        mut,
        seeds = [b"plan", plan.creator.key().as_ref()],
        bump = plan.bump
    )]
    pub plan: Account<'info, Plan>,
    
     /// CHECK: PDA used as delegate authority for token transfers
    #[account(
        seeds = [b"delegate", subscription.subscriber.as_ref()],
        bump,
    )]
    pub delegate_pda: AccountInfo<'info>,
    
    #[account(
        mut,
        constraint = creator_ata.owner == plan.creator,
        constraint = creator_ata.mint == plan.token_mint,
    )]
    pub creator_ata: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = subscriber_ata.owner == subscriber.key(),
        constraint = subscriber_ata.mint == plan.token_mint,
    )]
    pub subscriber_ata: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdatePlan<'info> {
    #[account(
        mut,
       has_one = creator,
       seeds = [b"plan", creator.key().as_ref()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, Plan>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscriber", subscriber.key().as_ref(), plan.key().as_ref()],
        has_one = subscriber,
        close = subscriber,
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscriber>,
    #[account(
        mut,
        seeds = [b"plan", plan.creator.key().as_ref()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, Plan>,
    pub subscriber: Signer<'info>,
}

#[account]
// Space = 8 + 32 + (4 + 50) + 32 + 8 + 8 + 4 + 1 + 8 + 1 
pub struct Plan {
    pub creator: Pubkey,
    pub name: String,
    pub token_mint: Pubkey,
    pub price: u64,
    pub interval: i64,
    pub subscriber_count: u32,
    pub bump: u8,
    pub created_at: i64,
    pub is_active: bool,
}

#[account]
// Space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8 
pub struct Subscriber {
    pub subscriber: Pubkey,
    pub plan: Pubkey,
    pub bump: u8,
    pub is_active: bool,
    pub last_charged_at: i64,
    pub next_charge_at: i64,
    pub created_at: i64,
}

#[event]
pub struct PlanCreated {
    pub creator: Pubkey,
    pub plan: Pubkey,
    pub price: u64,
    pub interval: i64,
    pub created_at: i64,
}

#[event]
pub struct SubscriptionCreated {
    pub user: Pubkey,
    pub plan: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SubscriptionCharged {
    pub user: Pubkey,
    pub plan: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SubscriptionCancelled {
    pub user: Pubkey,
    pub plan: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PlanUpdated {
    pub creator: Pubkey,
    pub plan: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PlanPaused {
    pub creator: Pubkey,
    pub plan: Pubkey,
    pub timestamp: i64,

}

#[event]
pub struct PlanResumed {
    pub creator: Pubkey,
    pub plan: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Plan is inactive")]
    PlanInactive,
    #[msg("Subscription is inactive")]
    SubscriptionInactive,
    #[msg("Not time yet")]
    NotTimeYet, 
    #[msg("Subscription is not active")]
    SubscriptionNotActive,  
}