// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SpendLimitWallet
 * @notice A smart wallet that enforces a maximum spend per fixed time window.
 *
 * State Machine
 * ─────────────
 *   IDLE   → No spending has occurred in the current window (or window has expired).
 *   ACTIVE → At least one spend has been approved; daily limit not yet reached.
 *   LOCKED → Cumulative spend has hit the daily limit.
 *            No further spending is allowed until the window resets.
 *
 * Window Behaviour
 * ────────────────
 *   The window is a fixed-duration period that opens on the first spend after
 *   it has expired. It is NOT a rolling/sliding window — once opened it runs
 *   for exactly `windowDuration` seconds regardless of further spend activity.
 *
 * Limit Updates
 * ─────────────
 *   If a window is currently active, a new limit is queued and applied only
 *   when the next window opens. If no window is active the change is immediate.
 *
 * Ownership Transfer
 * ──────────────────
 *   Two-step: current owner calls transferOwnership(); the nominee must call
 *   acceptOwnership() to complete the handover.
 *
 * Events
 * ──────
 *   Deposited                 – ETH deposited into the wallet.
 *   SpendApproved             – A spend was within the limit and executed.
 *   SpendRejected             – A spend was blocked (emitted; does NOT revert).
 *   WindowReset               – The window expired and a new one has begun.
 *   LimitUpdated              – A queued or immediate limit change took effect.
 *   LimitUpdateScheduled      – A limit change queued for next window.
 *   OwnershipTransferInitiated – Owner nominated a new owner.
 *   OwnershipTransferred       – New owner accepted; handover complete.
 */
contract SpendLimitWallet {

    // ─── State Variables ─────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    uint256 public dailyLimit;       // active cap in wei
    uint256 public pendingLimit;     // queued cap (applied at next window open)
    uint256 public windowDuration;   // window length in seconds

    uint256 public spentInWindow;    // cumulative ETH sent in the current window (wei)
    uint256 public windowStart;      // timestamp when the current window opened (0 = no window)

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum State { IDLE, ACTIVE, LOCKED }

    // ─── Events ──────────────────────────────────────────────────────────────

    event Deposited(address indexed from, uint256 amount);
    event SpendApproved(
        address indexed to,
        uint256 amount,
        string  description,
        uint256 spentTotal,
        uint256 remaining
    );
    event SpendRejected(
        address indexed to,
        uint256 amount,
        string  description,
        string  reason
    );
    event WindowReset(uint256 newWindowStart, uint256 previousSpent);
    event LimitUpdated(uint256 oldLimit, uint256 newLimit);
    event LimitUpdateScheduled(uint256 currentLimit, uint256 newLimit, uint256 effectiveAt);
    event OwnershipTransferInitiated(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Custom Errors ───────────────────────────────────────────────────────

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error LimitExceeded(uint256 requested, uint256 remaining);
    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroAmount();
    error ZeroLimit();
    error InvalidRecipient();
    error WindowTooShort();
    error TransferFailed();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _dailyLimit     Maximum wei that may be spent in one window.
     * @param _windowDuration Seconds in one window (minimum 3600 = 1 h; 0 → 24 h).
     */
    constructor(uint256 _dailyLimit, uint256 _windowDuration) {
        if (_dailyLimit == 0) revert ZeroLimit();
        uint256 dur = _windowDuration == 0 ? 86_400 : _windowDuration;
        if (dur < 3_600) revert WindowTooShort();
        owner          = msg.sender;
        dailyLimit     = _dailyLimit;
        windowDuration = dur;
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    function isWindowExpired() public view returns (bool) {
        if (windowStart == 0) return true;
        return block.timestamp >= windowStart + windowDuration;
    }

    function currentState() public view returns (State) {
        if (spentInWindow == 0 || isWindowExpired()) return State.IDLE;
        if (spentInWindow >= dailyLimit)             return State.LOCKED;
        return State.ACTIVE;
    }

    /**
     * @notice Aggregated window status for a single frontend read.
     */
    function getWindowInfo()
        external
        view
        returns (
            uint256 spent,
            uint256 remaining,
            uint256 windowEndsAt,
            State   state,
            uint256 balance
        )
    {
        bool expired = isWindowExpired();
        spent        = (expired || spentInWindow == 0) ? 0 : spentInWindow;
        remaining    = dailyLimit > spent ? dailyLimit - spent : 0;
        windowEndsAt = (windowStart > 0 && !expired)
            ? windowStart + windowDuration
            : 0;
        state   = currentState();
        balance = address(this).balance;
    }

    // ─── Internal Helpers ────────────────────────────────────────────────────

    /**
     * @dev Resets the window if it has expired and applies any pending limit.
     *      Must be called at the start of spend().
     */
    function _maybeResetWindow() internal {
        if (!isWindowExpired() || spentInWindow == 0) return;

        uint256 prev = spentInWindow;
        spentInWindow = 0;
        windowStart   = 0;

        // Apply queued limit update
        if (pendingLimit > 0) {
            emit LimitUpdated(dailyLimit, pendingLimit);
            dailyLimit   = pendingLimit;
            pendingLimit = 0;
        }

        emit WindowReset(block.timestamp, prev);
    }

    // ─── State-Changing Functions ────────────────────────────────────────────

    /**
     * @notice Attempt to send `amount` wei to `to`.
     *
     * Returns true on success, false if the daily limit would be exceeded.
     * Reverts only on hard errors (zero amount, zero recipient, insufficient balance,
     * failed ETH transfer).
     *
     * @param to          Recipient address (must be non-zero).
     * @param amount      Amount in wei to transfer.
     * @param description Human-readable label (e.g. "Pay for coffee").
     */
    function spend(
        address payable to,
        uint256         amount,
        string calldata description
    ) external onlyOwner returns (bool) {
        if (to == address(0))               revert InvalidRecipient();
        if (amount == 0)                    revert ZeroAmount();
        if (amount > address(this).balance) revert InsufficientBalance(amount, address(this).balance);

        // Auto-reset expired window and apply any pending limit
        _maybeResetWindow();

        // Check limit — emit event and return false instead of reverting
        uint256 projected = spentInWindow + amount;
        if (projected > dailyLimit) {
            emit SpendRejected(to, amount, description, "Daily limit exceeded");
            return false;
        }

        // Open the window on the first spend of a new window
        if (windowStart == 0) {
            windowStart = block.timestamp;
        }

        // Update state
        spentInWindow = projected;
        uint256 leftover = dailyLimit - spentInWindow;

        // Transfer using call() — forwards all available gas, checks return value
        (bool sent,) = to.call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit SpendApproved(to, amount, description, spentInWindow, leftover);
        return true;
    }

    /**
     * @notice Update the daily spending limit.
     *
     * If a window is currently active the new limit is queued and takes effect
     * at the start of the next window. If no window is active the change is
     * applied immediately.
     */
    function updateLimit(uint256 newLimit) external onlyOwner {
        if (newLimit == 0) revert ZeroLimit();

        if (windowStart > 0 && !isWindowExpired()) {
            // Active window — schedule for next window
            pendingLimit = newLimit;
            emit LimitUpdateScheduled(dailyLimit, newLimit, windowStart + windowDuration);
        } else {
            // No active window — apply immediately
            emit LimitUpdated(dailyLimit, newLimit);
            dailyLimit   = newLimit;
            pendingLimit = 0;
        }
    }

    /**
     * @notice Initiate a two-step ownership transfer. The nominee must call
     *         acceptOwnership() to complete the transfer.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferInitiated(owner, newOwner);
    }

    /**
     * @notice Complete the ownership transfer. Must be called by the pending owner.
     */
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    /**
     * @notice Deposit ETH into the wallet. Anyone can fund it.
     */
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Accept plain ETH transfers as deposits.
     */
    receive() external payable {
        if (msg.value > 0) {
            emit Deposited(msg.sender, msg.value);
        }
    }
}
