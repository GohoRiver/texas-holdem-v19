// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract TexasHoldemGame {
    IERC20 public bemToken;
    address public owner;
    
    mapping(address => uint256) public balances;
    mapping(address => uint256) public platformFees; 
    mapping(address => uint256) public nonces; // ★ 防重放攻击的 nonce

    event Deposited(address indexed player, uint256 amount, uint256 fee);
    event Withdrawn(address indexed player, uint256 amount);
    event FeeCollected(address indexed owner, uint256 amount);
    event Settled(address indexed player, uint256 oldBalance, uint256 newBalance);

    constructor(address _bem) {
        bemToken = IERC20(_bem);
        owner = msg.sender;
    }

    function deposit(uint256 _amount) external {
        require(_amount > 0, "amount must > 0");
        require(bemToken.transferFrom(msg.sender, address(this), _amount), "transfer failed");
        
        uint256 fee = (_amount * 2) / 100;
        uint256 netAmount = _amount - fee;

        balances[msg.sender] += netAmount;
        platformFees[owner] += fee;

        emit Deposited(msg.sender, netAmount, fee);
    }

    function withdraw(uint256 _amount) external {
        require(balances[msg.sender] >= _amount, "insufficient balance");
        balances[msg.sender] -= _amount;
        require(bemToken.transfer(msg.sender, _amount), "transfer failed");
        emit Withdrawn(msg.sender, _amount);
    }

    function withdrawPlatformFees() external {
        require(msg.sender == owner, "only owner");
        uint256 fee = platformFees[owner];
        require(fee > 0, "no fees");
        platformFees[owner] = 0;
        require(bemToken.transfer(owner, fee), "transfer failed");
        emit FeeCollected(owner, fee);
    }

    // ★ 新增：平台签名结算
    function settleBalance(address _player, uint256 _newBalance, uint256 _nonce, bytes memory _signature) external {
        require(nonces[_player] == _nonce, "invalid nonce");
        nonces[_player]++; // 递增 nonce，防止同一个签名被重复使用

        // 校验签名：确认签名是由平台 owner 签发的
        bytes32 messageHash = keccak256(abi.encodePacked(_player, _newBalance, _nonce));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        require(recoverSigner(ethSignedMessageHash, _signature) == owner, "invalid signature");

        uint256 oldBalance = balances[_player];
        balances[_player] = _newBalance; // 直接更新为最终筹码数

        emit Settled(_player, oldBalance, _newBalance);
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) internal pure returns (address) {
        require(_signature.length == 65, "invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function getBalance(address _player) external view returns (uint256) {
        return balances[_player];
    }
}