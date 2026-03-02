// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title A2AClearinghouse
 * @notice Minimal escrow for A2A IP license payments.
 *
 * Flow:
 *   1. Buyer negotiates off-chain with seller → receives a signed DealArtifact
 *      with an artifact_id (UUID string).
 *   2. Buyer computes: taskId = keccak256(bytes(artifact_id))
 *   3. Buyer calls lockFunds(taskId, sellerAddress) with ETH attached.
 *   4. The chain-listener.ts service detects FundsLocked and promotes the
 *      Supabase license from SIGNED → EXECUTING, unlocking key delivery.
 *   5. Buyer calls releaseFunds(taskId) after receiving and validating the IP.
 *
 * Deploy to Base Sepolia via Remix IDE:
 *   https://remix.ethereum.org → paste this file → compile 0.8.20 → deploy
 *   Copy the deployed address into dashboard/.env.local as A2A_CLEARINGHOUSE_ADDRESS
 */
contract A2AClearinghouse {

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    struct Lock {
        address         buyer;
        address payable seller;
        uint256         amount;
        bool            released;
    }

    /// @notice taskId → escrow lock. taskId = keccak256(bytes(artifact_id))
    mapping(bytes32 => Lock) public locks;

    // ─────────────────────────────────────────────────────────────────────────
    // Events — chain-listener.ts watches for these
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a buyer locks ETH for a specific license artifact.
    event FundsLocked(
        bytes32 indexed taskId,
        address indexed buyer,
        uint256         amount
    );

    /// @notice Emitted when the buyer releases ETH to the seller.
    event FundsReleased(
        bytes32 indexed taskId,
        address indexed seller,
        uint256         amount
    );

    /// @notice Emitted if the buyer reclaims funds (dispute / no delivery).
    event FundsReclaimed(
        bytes32 indexed taskId,
        address indexed buyer,
        uint256         amount
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Escrow functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Lock ETH for a specific artifact. Call with msg.value > 0.
     * @param taskId  keccak256(bytes(artifact_id_string)) — must be unique per artifact
     * @param seller  The licensor's Ethereum address to receive payment on release
     */
    function lockFunds(bytes32 taskId, address payable seller) external payable {
        require(msg.value > 0,             "A2A: must send ETH");
        require(seller != address(0),      "A2A: invalid seller");
        require(locks[taskId].amount == 0, "A2A: funds already locked for this taskId");

        locks[taskId] = Lock({
            buyer:    msg.sender,
            seller:   seller,
            amount:   msg.value,
            released: false
        });

        emit FundsLocked(taskId, msg.sender, msg.value);
    }

    /**
     * @notice Release locked ETH to the seller. Only the buyer can call this
     *         after receiving and validating the decrypted IP.
     * @param taskId  The same taskId used in lockFunds
     */
    function releaseFunds(bytes32 taskId) external {
        Lock storage lock = locks[taskId];
        require(lock.amount > 0,       "A2A: no funds locked for this taskId");
        require(!lock.released,        "A2A: funds already released");
        require(msg.sender == lock.buyer, "A2A: only the buyer can release");

        lock.released = true;
        uint256 payout = lock.amount;
        lock.seller.transfer(payout);

        emit FundsReleased(taskId, lock.seller, payout);
    }

    /**
     * @notice Reclaim locked ETH back to buyer (e.g. if seller never delivers).
     *         In production, add a timelock or dispute mechanism before enabling.
     *         For MVP: buyer can reclaim at any time before release.
     * @param taskId  The same taskId used in lockFunds
     */
    function reclaimFunds(bytes32 taskId) external {
        Lock storage lock = locks[taskId];
        require(lock.amount > 0,          "A2A: no funds locked for this taskId");
        require(!lock.released,           "A2A: funds already released");
        require(msg.sender == lock.buyer, "A2A: only the buyer can reclaim");

        lock.released = true;
        uint256 refund = lock.amount;
        payable(lock.buyer).transfer(refund);

        emit FundsReclaimed(taskId, lock.buyer, refund);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Compute the taskId for a given artifact_id string (convenience).
    function computeTaskId(string calldata artifactId) external pure returns (bytes32) {
        return keccak256(bytes(artifactId));
    }

    /// @notice Check whether funds are locked for a given taskId.
    function isLocked(bytes32 taskId) external view returns (bool) {
        return locks[taskId].amount > 0 && !locks[taskId].released;
    }
}
