# Chain287 验证者相关合约参考

## 核心合约地址

| 合约 | 地址 |
|---|---|
| BSCValidatorSet | `0x0000000000000000000000000000000000001000` |
| StakeHub | `0x0000000000000000000000000000000000002002` |

## 常用 cast 调用

### 获取活跃验证者 consensus 地址列表

```sh
cast call 0x0000000000000000000000000000000000001000 \
  "getValidators()(address[])" \
  --rpc-url "$CHAIN287_RPC_URL"
```

### 判断某个 consensus 地址是否活跃

```sh
cast call 0x0000000000000000000000000000000000001000 \
  "isCurrentValidator(address)(bool)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

### 获取 consensus 地址在 currentValidatorSet 中的索引

返回值为 `index + 1`，0 表示不在集合中。

```sh
cast call 0x0000000000000000000000000000000000001000 \
  "currentValidatorSetMap(address)(uint256)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

### 读取指定索引的验证者详情（含 jailed 字段）

```sh
cast call 0x0000000000000000000000000000000000001000 \
  "currentValidatorSet(uint256)(address,address,address,uint64,bool,uint256)" 0 \
  --rpc-url "$CHAIN287_RPC_URL"
```

返回值顺序：consensusAddress, feeAddress, BBCFeeAddress, votingPower, jailed, incoming

### 从 StakeHub 获取所有已注册验证者

```sh
cast call 0x0000000000000000000000000000000000002002 \
  "getValidators(uint256,uint256)(address[],address[],uint256)" 0 100 \
  --rpc-url "$CHAIN287_RPC_URL"
```

返回：operatorAddrs[], creditAddrs[], totalLength

### consensus 地址转 operator 地址

```sh
cast call 0x0000000000000000000000000000000000002002 \
  "consensusToOperator(address)(address)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

### operator 地址转 consensus 地址

```sh
cast call 0x0000000000000000000000000000000000002002 \
  "getValidatorConsensusAddress(address)(address)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

### 读取 StakeCredit Pool 总额

```sh
cast call 0x...creditContract... \
  "totalPooledBNB()(uint256)" \
  --rpc-url "$CHAIN287_RPC_URL"
```
