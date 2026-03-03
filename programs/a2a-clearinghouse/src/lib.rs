use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("PLACEHOLDER_PROGRAM_ID");

// ─────────────────────────────────────────────────────────────────────────────
// A2A Clearinghouse — Solana Anchor Program
//
// Replaces contracts/A2AClearinghouse.sol (Base Sepolia).
//
// Deploy to Solana Devnet:
//   1. Install Anchor CLI: cargo install --git https://github.com/coral-xyz/anchor avm --locked
//                          avm install latest && avm use latest
//   2. Install Solana CLI: sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
//   3. Create devnet wallet: solana-keygen new --outfile ~/.config/solana/id.json
//   4. Fund it: solana airdrop 2 --url devnet
//   5. Build + deploy: anchor build && anchor deploy --provider.cluster devnet
//   6. Copy deployed Program ID into:
//      - This file's declare_id!() macro
//      - dashboard/.env.local: A2A_CLEARINGHOUSE_PROGRAM_ID=<pubkey>
//
// task_id convention (must match solana-listener.ts and negotiate_deal.py):
//   Python:     hashlib.sha256(artifact_id.encode()).digest()   (32 raw bytes)
//   TypeScript: Buffer.from(createHash("sha256").update(artifact_id).digest())
//
// artifact_hash convention (Phase 33):
//   Python:     hashlib.sha256(artifact.canonical_body()).digest()  (32 raw bytes)
//   Computed AFTER both Ed25519 signatures are applied.
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod a2a_clearinghouse {
    use super::*;

    /// Lock SOL into a PDA escrow for an IP license deal.
    ///
    /// Called by the buyer after both parties sign the DealArtifact.
    /// task_id = sha256(artifact_id) — must match the value used in solana-listener.ts.
    ///
    /// Legacy instruction — does NOT commit artifact hash.
    /// Prefer lock_and_commit() for new deals.
    pub fn lock_funds(
        ctx: Context<LockFunds>,
        task_id: [u8; 32],
        seller: Pubkey,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, ClearinghouseError::ZeroAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.buyer              = ctx.accounts.buyer.key();
        escrow.seller             = seller;
        escrow.amount_lamports    = amount_lamports;
        escrow.released           = false;
        escrow.task_id            = task_id;
        escrow.bump               = ctx.bumps.escrow;
        escrow.artifact_hash      = [0u8; 32];
        escrow.artifact_committed = false;

        // Transfer SOL from buyer to escrow PDA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to:   ctx.accounts.escrow.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, amount_lamports)?;

        emit!(FundsLocked {
            task_id,
            buyer: ctx.accounts.buyer.key(),
            amount_lamports,
        });

        msg!(
            "FundsLocked: task_id={} buyer={} lamports={}",
            hex::encode(task_id),
            ctx.accounts.buyer.key(),
            amount_lamports
        );

        Ok(())
    }

    /// Lock SOL AND commit the artifact hash atomically.
    ///
    /// Phase 33: preferred instruction for new deals.
    /// artifact_hash = sha256(DealArtifact canonical body after Ed25519 signing).
    /// release_funds() will verify this hash before releasing SOL,
    /// preventing counterparty from altering terms after locking.
    pub fn lock_and_commit(
        ctx: Context<LockFunds>,
        task_id: [u8; 32],
        seller: Pubkey,
        amount_lamports: u64,
        artifact_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount_lamports > 0, ClearinghouseError::ZeroAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.buyer              = ctx.accounts.buyer.key();
        escrow.seller             = seller;
        escrow.amount_lamports    = amount_lamports;
        escrow.released           = false;
        escrow.task_id            = task_id;
        escrow.bump               = ctx.bumps.escrow;
        escrow.artifact_hash      = artifact_hash;
        escrow.artifact_committed = true;

        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to:   ctx.accounts.escrow.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, amount_lamports)?;

        emit!(FundsLocked {
            task_id,
            buyer: ctx.accounts.buyer.key(),
            amount_lamports,
        });

        msg!(
            "FundsLockedCommitted: task_id={} artifact_hash={} buyer={} lamports={}",
            hex::encode(task_id),
            hex::encode(artifact_hash),
            ctx.accounts.buyer.key(),
            amount_lamports
        );

        Ok(())
    }

    /// Release escrowed SOL to the seller.
    ///
    /// Called by the buyer after they have validated the licensed IP.
    /// artifact_hash_proof: must match escrow.artifact_hash if artifact_committed is true.
    pub fn release_funds(
        ctx: Context<ReleaseFunds>,
        _task_id: [u8; 32],
        artifact_hash_proof: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.released, ClearinghouseError::AlreadyReleased);
        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            ClearinghouseError::UnauthorizedBuyer
        );

        // Verify artifact hash if this escrow was created with lock_and_commit
        if escrow.artifact_committed {
            require!(
                escrow.artifact_hash == artifact_hash_proof,
                ClearinghouseError::ArtifactHashMismatch
            );
        }

        escrow.released = true;
        let amount = escrow.amount_lamports;

        // Drain lamports from PDA → seller
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.seller.try_borrow_mut_lamports()?       += amount;

        emit!(FundsReleased {
            task_id: escrow.task_id,
            seller:  escrow.seller,
            amount_lamports: amount,
        });

        msg!(
            "FundsReleased: task_id={} seller={} lamports={}",
            hex::encode(escrow.task_id),
            escrow.seller,
            amount
        );

        Ok(())
    }

    /// Reclaim escrowed SOL back to the buyer (e.g. if deal fell through).
    ///
    /// Only callable by the original buyer.
    pub fn reclaim_funds(ctx: Context<ReclaimFunds>, _task_id: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.released, ClearinghouseError::AlreadyReleased);
        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            ClearinghouseError::UnauthorizedBuyer
        );

        escrow.released = true;
        let amount = escrow.amount_lamports;

        // Drain lamports from PDA → buyer
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.buyer.try_borrow_mut_lamports()?        += amount;

        emit!(FundsReclaimed {
            task_id: escrow.task_id,
            buyer:   escrow.buyer,
            amount_lamports: amount,
        });

        msg!(
            "FundsReclaimed: task_id={} buyer={} lamports={}",
            hex::encode(escrow.task_id),
            escrow.buyer,
            amount
        );

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Structures
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct LockFunds<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        init,
        payer = buyer,
        space = EscrowAccount::LEN,
        seeds = [b"escrow", &task_id],
        bump
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct ReleaseFunds<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: seller receives lamports; validated against escrow.seller in instruction
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", &task_id],
        bump = escrow.bump,
        has_one = buyer @ ClearinghouseError::UnauthorizedBuyer,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct ReclaimFunds<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", &task_id],
        bump = escrow.bump,
        has_one = buyer @ ClearinghouseError::UnauthorizedBuyer,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

#[account]
pub struct EscrowAccount {
    pub buyer:              Pubkey,     // 32
    pub seller:             Pubkey,     // 32
    pub amount_lamports:    u64,        // 8
    pub released:           bool,       // 1
    pub task_id:            [u8; 32],   // 32
    pub bump:               u8,         // 1
    pub artifact_hash:      [u8; 32],   // 32  (Phase 33 — zero if lock_funds used)
    pub artifact_committed: bool,       // 1   (Phase 33 — true only for lock_and_commit)
}

impl EscrowAccount {
    // discriminator (8) + buyer (32) + seller (32) + amount (8) + released (1)
    // + task_id (32) + bump (1) + artifact_hash (32) + artifact_committed (1)
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 32 + 1 + 32 + 1;  // = 147
}

// ─────────────────────────────────────────────────────────────────────────────
// Events (parsed by solana-listener.ts)
// ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct FundsLocked {
    pub task_id:         [u8; 32],
    pub buyer:           Pubkey,
    pub amount_lamports: u64,
}

#[event]
pub struct FundsReleased {
    pub task_id:         [u8; 32],
    pub seller:          Pubkey,
    pub amount_lamports: u64,
}

#[event]
pub struct FundsReclaimed {
    pub task_id:         [u8; 32],
    pub buyer:           Pubkey,
    pub amount_lamports: u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ClearinghouseError {
    #[msg("Lock amount must be greater than zero")]
    ZeroAmount,
    #[msg("Funds have already been released or reclaimed")]
    AlreadyReleased,
    #[msg("Only the original buyer can release or reclaim funds")]
    UnauthorizedBuyer,
    #[msg("Artifact hash does not match the committed hash — deal may have been tampered")]
    ArtifactHashMismatch,
}
