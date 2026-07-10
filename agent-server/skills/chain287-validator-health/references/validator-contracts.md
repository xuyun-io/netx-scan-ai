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

函数 selector：`0xbff02e20`

### consensus 地址转 operator 地址

```sh
cast call 0x0000000000000000000000000000000000002002 \
  "consensusToOperator(address)(address)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

函数 selector：`0x86d54506`

### operator 地址转 consensus 地址

```sh
cast call 0x0000000000000000000000000000000000002002 \
  "getValidatorConsensusAddress(address)(address)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

函数 selector：`0x059ddd22`

### 读取 validator 基础状态

```sh
cast call 0x0000000000000000000000000000000000002002 \
  "getValidatorBasicInfo(address)(uint256,bool,uint256)" 0x... \
  --rpc-url "$CHAIN287_RPC_URL"
```

返回：createdTime, jailed, jailUntil

函数 selector：`0xcbb04d9d`

### 读取 StakeCredit Pool 总额

```sh
cast call 0x...creditContract... \
  "totalPooledBNB()(uint256)" \
  --rpc-url "$CHAIN287_RPC_URL"
```

函数 selector：`0x15d1f898`

### 读取 operator 在 StakeCredit 中的质押池份额

```sh
cast call 0x...creditContract... \
  "getPooledBNB(address)(uint256)" 0x...operator... \
  --rpc-url "$CHAIN287_RPC_URL"
```

函数 selector：`0x0913db47`

## 从同事脚本迁移时的边界

可以迁移：

- `bundle/ops/15a-validator-stats.py` 的 moniker、operator、consensus、pool、余额、出块窗口统计思路。
- `bundle/check_validators.sh` 和 `joinValidatorSet/scripts/07-miner-block.sh` 的 recent miner 分布统计。
- `joinValidatorSet/scripts/08-stop-and-wait-jailed.sh` 中只读的 `getValidatorBasicInfo` jail 查询。

必须排除：

- 停容器、SSM、docker、crontab、文件同步。
- `createValidator`、`delegate`、`undelegate`、`claim`、`cast send`。
- 任何私钥、keystore、password.txt、BLS private key 读取。
