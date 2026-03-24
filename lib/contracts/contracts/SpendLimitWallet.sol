// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SpendLimitWallet
 * @notice A smart wallet that enforces a maximum spend per rolling time window.
 *
 * State Machine
 * ─────────────
 *   IDLE   → No spending has occurred in the current window (or window has expired).
 *   ACTIVE → At least one spend has been approved, but the daily limit is not yet reached.
 *   LOCKED → The cumulative spend for this window has hit (or exceeded) the daily limit.
 *            No further spending is allowed until the window resets.
 *
 * Window Reset
 * ────────────
 *   When `spend()` is called and the previous window has expired, the contract
 *   automatically resets `spentInWindow` to zero and starts a fresh window.
 *
 * Events
 * ──────
 *   Deposited       – ETH deposited into the wallet.
 *   SpendApproved   – A spend was within the limit and executed successfully.
 *   SpendRejected   – A spend was blocked because it would exceed the limit.
 *   WindowReset     – The spending window expired and a new one has begun.
 *   LimitUpdated    – The owner changed the daily limit.
 */
contract SpendLimitWallet {
    // ─── State Variables ─────────────────────────────────────────────────────

    address public owner;
    uint256 public dailyLimit;       // cap in wei
    uint256 public windowDuration;   // window length in seconds (default: 86 400 = 24 h)

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

    // ─── Custom Errors ───────────────────────────────────────────────────────

    error NotOwner();
    error LimitExceeded(uint256 requested, uint256 remaining);
    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroAmount();
    error ZeroLimit();
    error InvalidRecipient();

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _dailyLimit     Maximum wei that may be spent in one window.
     * @param _windowDuration Seconds in one rolling window (0 → default 24 h).
     */
    constructor(uint256 _dailyLimit, uint256 _windowDuration) {
        if (_dailyLimit == 0) revert ZeroLimit();
        owner         = msg.sender;
        dailyLimit    = _dailyLimit;
        windowDuration = _windowDuration == 0 ? 86_400 : _windowDuration;
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    /**
     * @notice Returns true when the current spending window has expired.
     */
    function isWindowExpired() public view returns (bool) {
        if (windowStart == 0) return true;
        return block.timestamp >= windowStart + windowDuration;
    }

    /**
     * @notice Current state of the wallet's spend-limit state machine.
     */
    function currentState() public view returns (State) {
        if (spentInWindow == 0 || isWindowExpired()) return State.IDLE;
        if (spentInWindow >= dailyLimit)             return State.LOCKED;
        return State.ACTIVE;
    }

    /**
     * @notice Aggregated window status – useful for a single frontend read.
     * @return spent        Wei already spent in this window (0 if window expired).
     * @return remaining    Wei still available before the limit is hit.
     * @return windowEndsAt Unix timestamp when the window closes (0 if IDLE).
     * @return state        Current state-machine value.
     * @return balance      Contract's ETH balance.
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

    // ─── State-Changing Functions ────────────────────────────────────────────

    /**
     * @notice Attempt to send `amount` wei to `to`.
     *
     * Rules
     * ─────
     * 1. Only the owner may call this.
     * 2. If the current window has expired, it is reset automatically.
     * 3. The cumulative spend for this window must not exceed `dailyLimit`.
     * 4. The contract must hold sufficient ETH.
     *
     * @param to          Recipient address (must be non-zero).
     * @param amount      Amount in wei to transfer.
     * @param description Human-readable label (e.g. "NFT purchase").
     */
    function spend(
        address payable to,
        uint256         amount,
        string calldata description
    ) external onlyOwner {
        if (to == address(0))              revert InvalidRecipient();
        if (amount == 0)                   revert ZeroAmount();
        if (amount > address(this).balance)
            revert InsufficientBalance(amount, address(this).balance);

        // ── Auto-reset expired window ─────────────────────────────────────
        if (isWindowExpired() && spentInWindow > 0) {
            emit WindowReset(block.timestamp, spentInWindow);
            spentInWindow = 0;
            windowStart   = 0;
        }

        // ── Open window on first spend ────────────────────────────────────
        if (windowStart == 0) {
            windowStart = block.timestamp;
        }

        // ── Enforce limit ─────────────────────────────────────────────────
        uint256 projected = spentInWindow + amount;
        if (projected > dailyLimit) {
            uint256 rem = dailyLimit - spentInWindow;
            emit SpendRejected(to, amount, description, "Daily limit exceeded");
            revert LimitExceeded(amount, rem);
        }

        // ── Execute transfer ──────────────────────────────────────────────
        spentInWindow = projected;
        uint256 leftover = dailyLimit - spentInWindow;
        to.transfer(amount);

        emit SpendApproved(to, amount, description, spentInWindow, leftover);
    }

    /**
     * @notice Owner can adjust the daily limit at any time.
     *         The change takes effect immediately within the current window.
     */
    function updateLimit(uint256 newLimit) external onlyOwner {
        if (newLimit == 0) revert ZeroLimit();
        emit LimitUpdated(dailyLimit, newLimit);
        dailyLimit = newLimit;
    }

    /**
     * @notice Deposit ETH into the wallet. Anyone can fund it.
     */
    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Fallback – accept plain ETH transfers as deposits.
     */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }
}
