import { keyBy, merge } from 'lodash';

import { backgroundMethod } from '@onekeyhq/shared/src/background/backgroundDecorators';
import { OneKeyInternalError } from '@onekeyhq/shared/src/errors';
import { buildFuse } from '@onekeyhq/shared/src/modules3rdParty/fuse';
import accountUtils, {
  buildAccountLocalAssetsKey,
} from '@onekeyhq/shared/src/utils/accountUtils';
import type {
  IAccountToken,
  IToken,
  ITokenFiat,
} from '@onekeyhq/shared/types/token';

import { SimpleDbEntityBase } from '../base/SimpleDbEntityBase';

export interface ILocalTokens {
  data: Record<string, IToken>; // <networkId_tokenIdOnNetwork, token>
  tokenList: Record<string, IAccountToken[]>; // <networkId_accountAddress/xpub, IAccountToken[]>
  smallBalanceTokenList: Record<string, IAccountToken[]>; // <networkId_accountAddress/xpub, IAccountToken[]>
  riskyTokenList: Record<string, IAccountToken[]>; // <networkId_accountAddress/xpub, IAccountToken[]>
  tokenListMap: Record<string, Record<string, ITokenFiat>>; // <networkId_accountAddress/xpub, Record<string, ITokenFiat>>
  tokenListValue: Record<string, string>; // <networkId_accountAddress/xpub, string>
}

export class SimpleDbEntityLocalTokens extends SimpleDbEntityBase<ILocalTokens> {
  entityName = 'localTokens';

  override enableCache = false;

  @backgroundMethod()
  async updateTokens({
    networkId,
    tokens,
  }: {
    networkId: string;
    tokens: IToken[];
  }) {
    const tokenMap = keyBy(
      tokens.map((token) => ({
        ...token,
        '$key': accountUtils.buildLocalTokenId({
          networkId,
          tokenIdOnNetwork: token.address,
        }),
      })),
      '$key',
    );
    await this.setRawData(({ rawData }) => ({
      data: merge({}, rawData?.data, tokenMap),
      tokenList: rawData?.tokenList ?? {},
      smallBalanceTokenList: rawData?.smallBalanceTokenList ?? {},
      riskyTokenList: rawData?.riskyTokenList ?? {},
      tokenListMap: rawData?.tokenListMap ?? {},
      tokenListValue: rawData?.tokenListValue ?? {},
    }));
  }

  @backgroundMethod()
  async getToken({
    networkId,
    tokenIdOnNetwork,
  }: {
    networkId: string;
    tokenIdOnNetwork: string;
  }) {
    const tokenId = accountUtils.buildLocalTokenId({
      networkId,
      tokenIdOnNetwork,
    });
    const tokenMap = (await this.getRawData())?.data;
    if (tokenMap) {
      const token = tokenMap[tokenId];
      if (token) {
        return token;
      }
    }
  }

  @backgroundMethod()
  async getTokens({
    networkId,
    tokenIdOnNetworkList,
  }: {
    networkId: string;
    tokenIdOnNetworkList: string[];
  }) {
    const tokenMap = (await this.getRawData())?.data;
    if (!tokenMap) {
      return [];
    }

    return tokenIdOnNetworkList
      .map((tokenIdOnNetwork) => {
        const tokenId = accountUtils.buildLocalTokenId({
          networkId,
          tokenIdOnNetwork,
        });
        return tokenMap[tokenId];
      })
      .filter((token): token is IToken => !!token);
  }

  @backgroundMethod()
  async searchTokens(params: { keywords: string }): Promise<IToken[]> {
    const rawData = await this.getRawData();
    const tokenMap = rawData?.data;

    if (!tokenMap) {
      return [];
    }

    const tokens = Object.values(tokenMap);
    const fuse = buildFuse(tokens, {
      keys: ['address'],
    });
    const result = fuse.search(params.keywords).map((i) => i.item);
    return result;
  }

  @backgroundMethod()
  async updateAccountTokenList({
    networkId,
    accountAddress,
    xpub,
    tokenList,
    smallBalanceTokenList,
    riskyTokenList,
    tokenListMap,
    tokenListValue,
  }: {
    networkId: string;
    accountAddress?: string;
    xpub?: string;
    tokenList: IAccountToken[];
    smallBalanceTokenList: IAccountToken[];
    riskyTokenList: IAccountToken[];
    tokenListMap: Record<string, ITokenFiat>;
    tokenListValue: string;
  }) {
    if (!accountAddress && !xpub) {
      throw new OneKeyInternalError('accountAddress or xpub is required');
    }

    const key = buildAccountLocalAssetsKey({ networkId, accountAddress, xpub });

    await this.setRawData(({ rawData }) => ({
      data: rawData?.data ?? {},
      tokenList: {
        ...rawData?.tokenList,
        [key]: tokenList,
      },
      smallBalanceTokenList: {
        ...rawData?.smallBalanceTokenList,
        [key]: smallBalanceTokenList,
      },
      riskyTokenList: {
        ...rawData?.riskyTokenList,
        [key]: riskyTokenList,
      },
      tokenListMap: {
        ...rawData?.tokenListMap,
        [key]: tokenListMap,
      },
      tokenListValue: {
        ...rawData?.tokenListValue,
        [key]: tokenListValue,
      },
    }));
  }

  @backgroundMethod()
  async getAccountTokenList({
    networkId,
    accountAddress,
    xpub,
  }: {
    networkId: string;
    accountAddress?: string;
    xpub?: string;
  }) {
    if (!accountAddress && !xpub) {
      throw new OneKeyInternalError('accountAddress or xpub is required');
    }
    const key = buildAccountLocalAssetsKey({ networkId, accountAddress, xpub });
    const rawData = await this.getRawData();
    return {
      tokenList: rawData?.tokenList?.[key] ?? [],
      smallBalanceTokenList: rawData?.smallBalanceTokenList?.[key] ?? [],
      riskyTokenList: rawData?.riskyTokenList?.[key] ?? [],
      tokenListMap: rawData?.tokenListMap?.[key] ?? {},
      tokenListValue: rawData?.tokenListValue?.[key] ?? '0',
    };
  }

  @backgroundMethod()
  async clearTokens() {
    await this.setRawData({
      data: {},
      tokenList: {},
      smallBalanceTokenList: {},
      riskyTokenList: {},
      tokenListMap: {},
      tokenListValue: {},
    });
  }
}
