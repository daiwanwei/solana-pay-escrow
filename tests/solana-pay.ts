import * as anchor from '@project-serum/anchor';
import { Program, Wallet } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import { SolanaPay } from '../target/types/solana_pay';
import { PublicKey, SystemProgram, Transaction, Connection, Commitment, clusterApiUrl } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  Account,
  Mint
} from '@solana/spl-token';
import { assert } from "chai";

describe('solana-pay-escrow', () => {
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaPay as Program<SolanaPay>;
  const wallet = provider.wallet as Wallet;

  // let mintB = anchor.web3.Keypair.generate();
  let mintB = null;
  let merchantTokenAccountB = null;
  let buyerTokenAccountB = null;
  let vault_account_pda = null;
  let vault_account_bump = null;
  let vault_authority_pda = null;

  const paymentAmount = 500;

  const escrowAccount = anchor.web3.Keypair.generate();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const merchantMainAccount = anchor.web3.Keypair.generate();
  const buyerMainAccount = anchor.web3.Keypair.generate();

  it("Initialize program state", async () => {
    let mintB = await createMint(
              provider.connection,
              wallet.payer,
              wallet.publicKey,
              null,
              0,
              anchor.web3.Keypair.generate(),
              null,
              TOKEN_PROGRAM_ID
    );
    // Airdropping tokens to a payer.
    const airdropTx = await provider.connection.requestAirdrop(payer.publicKey, 1000000000);
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx
    });

    // Fund Main Accounts
    await provider.sendAndConfirm(
      (() => {
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: merchantMainAccount.publicKey,
            lamports: 100000000,
          }),
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: buyerMainAccount.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [payer]
    );

    // const mintB = await newMint();
    // const merchantTokenAccountB = await createTokenAccount(provider, wallet, mintB, merchantMainAccount.publicKey);
    const merchantTokenAccountB = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintB,
        merchantMainAccount.publicKey,
        false,
        "processed",
        null,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);
    // const buyerTokenAccountB = await createTokenAccount(provider, wallet, mintB, buyerMainAccount.publicKey);
    const buyerTokenAccountB = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        mintB,
        buyerMainAccount.publicKey,
        false,
        "processed",
        null,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);
    await mintTo(
        provider.connection,
        wallet.payer,
        mintB,
        buyerTokenAccountB.address,
        wallet.publicKey,
        paymentAmount,
        [wallet.payer],
        null,
        TOKEN_PROGRAM_ID);

    let _buyerTokenAccountB = await getAccount(
      provider.connection,
      buyerTokenAccountB.address,
      "processed",
      TOKEN_PROGRAM_ID
    );

    assert.ok(Number(_buyerTokenAccountB.amount) == paymentAmount);
  });

  it("Initialize escrow", async () => {
    // console.log(program);
    let mintB = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0,
      anchor.web3.Keypair.generate(),
      null,
      TOKEN_PROGRAM_ID
    );
    // Airdropping tokens to a payer.
    const airdropTx = await provider.connection.requestAirdrop(payer.publicKey, 1000000000);
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: airdropTx
    });

  // Fund Main Accounts
  await provider.sendAndConfirm(
  (() => {
    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: merchantMainAccount.publicKey,
        lamports: 100000000,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: buyerMainAccount.publicKey,
        lamports: 100000000,
      })
    );
    return tx;
  })(),
  [payer]
  );

  const merchantTokenAccountB = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mintB,
    merchantMainAccount.publicKey,
    false,
    "processed",
    null,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID);

  const buyerTokenAccountB = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mintB,
    buyerMainAccount.publicKey,
    false,
    "processed",
    null,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID);

  await mintTo(
    provider.connection,
    wallet.payer,
    mintB,
    buyerTokenAccountB.address,
    wallet.publicKey,
    paymentAmount,
    [wallet.payer],
    null,
    TOKEN_PROGRAM_ID);

    const [_vault_account_pda, _vault_account_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token-seed"))],
      program.programId
    );
    vault_account_pda = _vault_account_pda;
    vault_account_bump = _vault_account_bump;

    const [_vault_authority_pda, _vault_authority_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))],
      program.programId
    );
    vault_authority_pda = _vault_authority_pda;

    // const mintBPubkey = new anchor.web3.PublicKey(mintB);
    // console.log(mintB);
    console.log(program);
    await program.methods.
      initialize(
        vault_account_bump,
        new anchor.BN(paymentAmount)).accounts(
          {
            merchant: merchantMainAccount.publicKey,
            mint: mintB,
            vaultAccount: vault_account_pda,
            merchantReceiveTokenAccount: merchantTokenAccountB.address,
            escrowAccount: escrowAccount.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID
          }).signers([escrowAccount, merchantMainAccount]);

    // let _vault = await mintB.getAccountInfo(vault_account_pda);

    let _vault = await getAccount(
      provider.connection,
      vault_account_pda,
      "processed",
      TOKEN_PROGRAM_ID
    );

    let _escrowAccount = await program.account.escrowAccount.fetch(
      escrowAccount.publicKey
    );

    // Check that the new owner is the PDA.
    assert.ok(_vault.owner.equals(vault_authority_pda));

    // Check that the values in the escrow account match what we expect.
    assert.ok(_escrowAccount.merchantKey.equals(merchantMainAccount.publicKey));
    assert.ok(_escrowAccount.buyerAmount.toNumber() == paymentAmount);
    assert.ok(
      _escrowAccount.merchantReceiveTokenAccount.equals(merchantTokenAccountB.address)
    );
  });

  // it("Exchange escrow state", async () => {
  //   await program.rpc.exchange({
  //     accounts: {
  //       buyer: buyerMainAccount.publicKey,
  //       buyerDepositTokenAccount: takerTokenAccountB,
  //       merchantReceiveTokenAccount: merchantTokenAccountB,
  //       merchant: merchantMainAccount.publicKey,
  //       escrowAccount: escrowAccount.publicKey,
  //       vaultAccount: vault_account_pda,
  //       vaultAuthority: vault_authority_pda,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //     },
  //     signers: [buyerMainAccount]
  //   });

  //   let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB.address);
  //   let _merchantTokenAccountB = await mintB.getAccountInfo(merchantTokenAccountB);

  //   assert.ok(_merchantTokenAccountB.amount.toNumber() == takerAmount);
  //   assert.ok(_takerTokenAccountB.amount.toNumber() == 0);
  // });

  // it("Initialize escrow and cancel escrow", async () => {
  //   // Put back tokens into merchant token A account.
  //   await mintA.mintTo(
  //     merchantTokenAccountA,
  //     mintAuthority.publicKey,
  //     [mintAuthority],
  //     merchantAmount
  //   );

  //   await program.rpc.initialize(
  //     vault_account_bump,
  //     new anchor.BN(merchantAmount),
  //     new anchor.BN(takerAmount),
  //     {
  //       accounts: {
  //         merchant: merchantMainAccount.publicKey,
  //         vaultAccount: vault_account_pda,
  //         mint: mintA.publicKey,
  //         merchantReceiveTokenAccount: merchantTokenAccountB,
  //         escrowAccount: escrowAccount.publicKey,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //         rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  //         tokenProgram: TOKEN_PROGRAM_ID,
  //       },
  //       instructions: [
  //         await program.account.escrowAccount.createInstruction(escrowAccount),
  //       ],
  //       signers: [escrowAccount, merchantMainAccount],
  //     }
  //   );

  //   // Cancel the escrow.
  //   await program.rpc.cancel({
  //     accounts: {
  //       merchant: merchantMainAccount.publicKey,
  //       vaultAccount: vault_account_pda,
  //       vaultAuthority: vault_authority_pda,
  //       escrowAccount: escrowAccount.publicKey,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //     },
  //     signers: [merchantMainAccount]
  //   });

  //   // Check the final owner should be the provider public key.
  //   const _merchantTokenAccountA = await mintA.getAccountInfo(merchantTokenAccountA);
  //   assert.ok(_merchantTokenAccountA.owner.equals(merchantMainAccount.publicKey));

  //   // Check all the funds are still there.
  //   assert.ok(_merchantTokenAccountA.amount.toNumber() == merchantAmount);
  // });
});
