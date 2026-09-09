export interface paths {
    "/auth/tokens": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Api Tokens */
        get: operations["list_api_tokens_auth_tokens_get"];
        put?: never;
        /**
         * Create Api Token
         * @description Gera um novo token pro usuário logado colar no config.yaml do client Go.
         */
        post: operations["create_api_token_auth_tokens_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/tokens/{token_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Api Token */
        delete: operations["delete_api_token_auth_tokens__token_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Auth:Jwt.Login */
        post: operations["auth_jwt_login_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Auth:Jwt.Logout */
        post: operations["auth_jwt_logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register:Register */
        post: operations["register_register_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Users:Current User */
        get: operations["users_current_user_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Users:Patch Current User */
        patch: operations["users_patch_current_user_auth_me_patch"];
        trace?: never;
    };
    "/auth/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Users:User */
        get: operations["users_user_auth__id__get"];
        put?: never;
        post?: never;
        /** Users:Delete User */
        delete: operations["users_delete_user_auth__id__delete"];
        options?: never;
        head?: never;
        /** Users:Patch User */
        patch: operations["users_patch_user_auth__id__patch"];
        trace?: never;
    };
    "/client/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Client Me
         * @description Ping autenticado pro client Go conferir, no boot, que o token dele é válido — sem
         *     precisar ter dado pra mandar.
         *
         *     Sem isso o único sinal de token errado é um 401 perdido no `albiondata-client.log`, e o
         *     usuário não consegue distinguir "token errado" de "client não está coletando" (achado
         *     `N6`) — dois modos de falha silenciosa com o mesmo sintoma: "não aparece nada no site".
         */
        get: operations["client_me_client_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/marketorders.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingest Market Orders */
        post: operations["ingest_market_orders_marketorders_ingest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/markethistories.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingest Market History */
        post: operations["ingest_market_history_markethistories_ingest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/goldprices.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ingest Gold Prices */
        post: operations["ingest_gold_prices_goldprices_ingest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/mapdata.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ingest Mapdata Descartado
         * @description Aceita, registra e descarta. Mesmo espírito de `process_gold_prices`: responder 200 e
         *     logar o descarte é melhor que 404 (barulho no client) ou que sumir com o dado em
         *     silêncio.
         *
         *     O corpo **não é lido nem parseado** de propósito — não vale escrever schema pra dado que
         *     descartamos, e o middleware `LimitarTamanhoDoCorpo` (src/main.py) já rejeita acima de
         *     10 MB antes de qualquer parse.
         */
        post: operations["ingest_mapdata_descartado_mapdata_ingest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/banditevent.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ingest Banditevent Descartado
         * @description Aceita, registra e descarta. Mesmo espírito de `process_gold_prices`: responder 200 e
         *     logar o descarte é melhor que 404 (barulho no client) ou que sumir com o dado em
         *     silêncio.
         *
         *     O corpo **não é lido nem parseado** de propósito — não vale escrever schema pra dado que
         *     descartamos, e o middleware `LimitarTamanhoDoCorpo` (src/main.py) já rejeita acima de
         *     10 MB antes de qualquer parse.
         */
        post: operations["ingest_banditevent_descartado_banditevent_ingest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/festivities.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ingest Festivities Descartado
         * @description Aceita, registra e descarta. Mesmo espírito de `process_gold_prices`: responder 200 e
         *     logar o descarte é melhor que 404 (barulho no client) ou que sumir com o dado em
         *     silêncio.
         *
         *     O corpo **não é lido nem parseado** de propósito — não vale escrever schema pra dado que
         *     descartamos, e o middleware `LimitarTamanhoDoCorpo` (src/main.py) já rejeita acima de
         *     10 MB antes de qualquer parse.
         */
        post: operations["ingest_festivities_descartado_festivities_ingest_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/items/{unique_name}/recipe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Recipe */
        get: operations["read_recipe_items__unique_name__recipe_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/items/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Item Catalog */
        get: operations["search_item_catalog_items_search_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/locations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Locations */
        get: operations["read_locations_locations_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/items/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Categories */
        get: operations["read_categories_items_categories_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/items/{unique_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Item */
        get: operations["read_item_items__unique_name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog/recipes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Recipe Catalog
         * @description Catálogo estático inteiro, **sem preço e sem paginação** (task 4/02, achado `X01`).
         *
         *     Paginar ou filtrar por preço aqui reintroduziria o defeito que a Fase 4 existe para
         *     resolver: a lista de receitas do produto voltaria a ser um recorte do que já tem preço, em
         *     vez do catálogo.
         */
        get: operations["read_recipe_catalog_catalog_recipes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/prices/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Price Snapshot
         * @description Top of book for a whole realm, optionally narrowed to specific markets. Returns **every** combination it has, with no freshness cut-off: each side carries its own `observed_at` and `source` so the client can decide what to trust and what to hide. Sides are `sell` (game offers, the ask) and `buy` (game requests, the bid); `null` means no price, never zero.
         */
        get: operations["read_price_snapshot_prices_snapshot_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/items/{item_id}/prices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Item Prices
         * @description Global partial observations (`scope=all`), or the combinations limited to the market sources the authenticated user collected (`scope=mine`). Book and history have independent coverage; `limit`, `offset` and `location_id` control the slice. The book sides are `sell` (game offers, the ask) and `buy` (game requests, the bid).
         */
        get: operations["read_item_prices_items__item_id__prices_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/items/{item_id}/demand": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Item Demand
         * @description Platform-wide demand view. This endpoint takes no `scope`; per-user coverage applies only to the prices endpoint. `book` is demand parked in the request side, `sold` is real turnover over three windows, `series_6h` is the raw series for a trend plot.
         */
        get: operations["read_item_demand_items__item_id__demand_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/craft/simulate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Simulate */
        post: operations["simulate_craft_simulate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/craft/compare": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Compare */
        post: operations["compare_craft_compare_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/flips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Flips */
        get: operations["flips_opportunities_flips_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/refining": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Refining */
        get: operations["refining_opportunities_refining_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/opportunities/crafting": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Crafting */
        get: operations["crafting_opportunities_crafting_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Health
         * @description Só confirma que o processo está de pé — não checa dependências externas.
         */
        get: operations["health_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ready
         * @description Confirma as dependências obrigatórias antes de o orquestrador rotear tráfego.
         */
        get: operations["ready_ready_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * AcquisitionMode
         * @description How ingredients are acquired.
         * @enum {string}
         */
        AcquisitionMode: "immediate" | "buy_order";
        /** AcquisitionQuoteOut */
        AcquisitionQuoteOut: {
            /** Item Id */
            item_id: string;
            /** Quality Level */
            quality_level: number;
            /** Enchantment Level */
            enchantment_level: number;
            /** Quantity */
            quantity: number;
            /**
             * Category
             * @enum {string}
             */
            category: "ready_item" | "ingredient" | "upgrade_resource";
            quote: components["schemas"]["MarketQuoteOut"];
        };
        /**
         * AlbionServer
         * @enum {string}
         */
        AlbionServer: "west" | "east" | "europe";
        /**
         * ApiTokenCreated
         * @description Retornado só na criação — é a única vez que o token em texto plano é exposto.
         */
        ApiTokenCreated: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Token */
            token: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * ApiTokenPublic
         * @description Usado ao listar tokens existentes — nunca reexpõe o valor do token, só o suficiente
         *     para identificar o token na UI sem revelar o segredo.
         */
        ApiTokenPublic: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Token Sufixo */
            token_sufixo: string;
            /** Nome */
            nome: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Revoked At */
            revoked_at: string | null;
            /** Ultimo Uso Em */
            ultimo_uso_em: string | null;
        };
        /** BearerResponse */
        BearerResponse: {
            /** Access Token */
            access_token: string;
            /** Token Type */
            token_type: string;
        };
        /** Body_auth_jwt_login_auth_login_post */
        Body_auth_jwt_login_auth_login_post: {
            /** Grant Type */
            grant_type?: string | null;
            /** Username */
            username: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Scope
             * @default
             */
            scope: string;
            /** Client Id */
            client_id?: string | null;
            /**
             * Client Secret
             * Format: password
             */
            client_secret?: string | null;
        };
        /** BookOut */
        BookOut: {
            sell: components["schemas"]["BookSide"];
            buy: components["schemas"]["BookSide"];
            /**
             * Coverage
             * @constant
             */
            coverage: "parcial";
            /** Freshness Window Seconds */
            freshness_window_seconds: number;
        };
        /**
         * BookSide
         * @description One side of the order book — ``sell`` (game ``offer``, the ask) or ``buy`` (game
         *     ``request``, the bid). Separate price universes: in real T2 cotton the sell side sat at
         *     37-39 and the buy side at 1-35 — they must never be collapsed into a single price.
         */
        BookSide: {
            /** Best Price */
            best_price?: string | null;
            /**
             * Observed Units
             * @default 0
             */
            observed_units: number;
            /**
             * Observed Orders
             * @default 0
             */
            observed_orders: number;
            /** Observed At */
            observed_at?: string | null;
            /** Age Seconds */
            age_seconds?: number | null;
        };
        /**
         * CatalogIngredientOut
         * @description Um ingrediente da receita. A ordem no array **é** a `position` original do dump.
         */
        CatalogIngredientOut: {
            /** Item */
            item: string;
            /** Count */
            count: number;
            /**
             * Enchantment Level
             * @default 0
             */
            enchantment_level: number;
        };
        /**
         * CatalogItemOut
         * @description Um item referenciado pelo catálogo — como saída, ingrediente ou recurso de upgrade.
         */
        CatalogItemOut: {
            /** Unique Name */
            unique_name: string;
            /** Name En */
            name_en?: string | null;
            /** Name Pt */
            name_pt?: string | null;
            /** Tier */
            tier?: number | null;
            /**
             * Enchantment Level
             * @default 0
             */
            enchantment_level: number;
            /** Weight */
            weight?: string | null;
            /** Shop Category */
            shop_category?: string | null;
            /** Shop Subcategory */
            shop_subcategory?: string | null;
        };
        /** CatalogRecipeOut */
        CatalogRecipeOut: {
            /** Output Item */
            output_item: string;
            /** Production Kind */
            production_kind: string;
            /** Enchantment Level */
            enchantment_level: number;
            /** Silver Cost */
            silver_cost: number;
            /** Crafting Focus */
            crafting_focus: number;
            /** Amount Crafted */
            amount_crafted: number;
            /** Ingredients */
            ingredients: components["schemas"]["CatalogIngredientOut"][];
            upgrade_resource?: components["schemas"]["CatalogUpgradeResourceOut"] | null;
        };
        /**
         * CatalogRecipesOut
         * @description O catálogo inteiro. **Sem paginação e sem preço** — paginar aqui reintroduziria o
         *     problema que a Fase 4 existe para resolver (`X01`): a lista de receitas do produto deixaria
         *     de ser o catálogo e voltaria a ser um recorte.
         */
        CatalogRecipesOut: {
            /** Version */
            version: string;
            /** Kind */
            kind?: string | null;
            /** Items */
            items: components["schemas"]["CatalogItemOut"][];
            /** Recipes */
            recipes: components["schemas"]["CatalogRecipeOut"][];
        };
        /**
         * CatalogUpgradeResourceOut
         * @description Rota alternativa: encantar um item já craftado, em vez de craftá-lo já encantado.
         */
        CatalogUpgradeResourceOut: {
            /** Item */
            item: string;
            /** Count */
            count: number;
        };
        /** CategoryOut */
        CategoryOut: {
            /** Category */
            category: string;
            /** Subcategory */
            subcategory?: string | null;
            /** Subcategory2 */
            subcategory2?: string | null;
            /** Subcategory3 */
            subcategory3?: string | null;
        };
        /** CityComparisonOut */
        CityComparisonOut: {
            /** Location Id */
            location_id: string;
            /** Location Name */
            location_name: string;
            /** Routes */
            routes: components["schemas"]["CompareRouteOut"][];
            /** Best Route */
            best_route: ("buy_ready" | "craft_direct" | "base_upgrade") | null;
            /** Profit */
            profit: string | null;
            /** Roi */
            roi: string | null;
        };
        /**
         * ClientIdentity
         * @description Resposta de `GET /client/me` — o que o client Go usa pra confirmar, no boot, que o
         *     token dele é válido (ver docs/tasks/client/04). Só identifica; nunca reexpõe o valor do
         *     token. `email` é o do próprio dono do token, então não vaza dado de terceiro, e
         *     `token_sufixo` diz *qual* token está em uso sem revelar o segredo.
         */
        ClientIdentity: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Token Sufixo */
            token_sufixo: string;
        };
        /** CompareRouteCostOut */
        CompareRouteCostOut: {
            /** Ready Item Cost */
            ready_item_cost: string | null;
            /** Ingredient Cost */
            ingredient_cost: string | null;
            /** Upgrade Resource Cost */
            upgrade_resource_cost: string | null;
            /** Recipe Silver Cost */
            recipe_silver_cost: string;
            /** Station Cost */
            station_cost: string;
            /** Acquisition Setup Fee */
            acquisition_setup_fee: string | null;
            /** Total Cost */
            total_cost: string | null;
        };
        /** CompareRouteOut */
        CompareRouteOut: {
            /**
             * Route
             * @enum {string}
             */
            route: "buy_ready" | "craft_direct" | "base_upgrade";
            /** Available */
            available: boolean;
            /** Unavailable Reason */
            unavailable_reason: string | null;
            /** Executions */
            executions: number;
            /** Produced Quantity */
            produced_quantity: number;
            /** Surplus Quantity */
            surplus_quantity: number;
            /** Focus Consumed */
            focus_consumed: number;
            costs: components["schemas"]["CompareRouteCostOut"];
            /** Acquisition Quotes */
            acquisition_quotes: components["schemas"]["AcquisitionQuoteOut"][];
            /** Upgrade Steps */
            upgrade_steps: components["schemas"]["UpgradeStepOut"][];
            sale_quote: components["schemas"]["MarketQuoteOut"];
            /** Net Revenue */
            net_revenue: string | null;
            /** Profit */
            profit: string | null;
            /** Profit Per Unit */
            profit_per_unit: string | null;
            /** Roi */
            roi: string | null;
            /** Warnings */
            warnings: components["schemas"]["CraftWarning"][];
        };
        /** CostBreakdownOut */
        CostBreakdownOut: {
            /** Ingredient Cost */
            ingredient_cost: string | null;
            /** Recipe Silver Cost */
            recipe_silver_cost: string;
            /** Station Cost */
            station_cost: string;
            /** Upgrade Cost */
            upgrade_cost: string;
            /** Acquisition Setup Fee */
            acquisition_setup_fee: string | null;
            /** Total Cost */
            total_cost: string | null;
        };
        /** CraftCompareOut */
        CraftCompareOut: {
            server: components["schemas"]["AlbionServer"];
            /** Output Item */
            output_item: string;
            /** Output Quality */
            output_quality: number;
            /**
             * Scope
             * @enum {string}
             */
            scope: "all" | "mine";
            /** Requested Quantity */
            requested_quantity: number;
            acquisition_mode: components["schemas"]["AcquisitionMode"];
            sale_mode: components["schemas"]["SaleMode"];
            /**
             * Same City Only
             * @constant
             */
            same_city_only: true;
            /**
             * Transport Included
             * @constant
             */
            transport_included: false;
            /** Sales Tax Rate */
            sales_tax_rate: string;
            /** Setup Fee Rate */
            setup_fee_rate: string;
            /** Ranked Cities */
            ranked_cities: components["schemas"]["CityComparisonOut"][];
            /** Unavailable Cities */
            unavailable_cities: components["schemas"]["CityComparisonOut"][];
        };
        /** CraftCompareRequest */
        CraftCompareRequest: {
            server: components["schemas"]["AlbionServer"];
            /** Output Item */
            output_item: string;
            /** Quantity */
            quantity: number;
            /**
             * Output Quality
             * @default 1
             */
            output_quality: number;
            /**
             * Scope
             * @default all
             * @enum {string}
             */
            scope: "all" | "mine";
            /**
             * Return Rate
             * @default 0
             */
            return_rate: number | string;
            /**
             * Station Cost Per Execution
             * @default 0
             */
            station_cost_per_execution: number | string;
            /**
             * Use Focus
             * @default false
             */
            use_focus: boolean;
            /**
             * Premium
             * @default true
             */
            premium: boolean;
            /** Sales Tax Rate */
            sales_tax_rate?: number | string | null;
            /** Setup Fee Rate */
            setup_fee_rate?: number | string | null;
            /** Ingredient Overrides */
            ingredient_overrides?: {
                [key: string]: components["schemas"]["IngredientOverride"];
            };
            /** Manual Prices */
            manual_prices?: {
                [key: string]: components["schemas"]["ManualPriceOverride"];
            };
            /** @default immediate */
            acquisition_mode: components["schemas"]["AcquisitionMode"];
            /** @default immediate */
            sale_mode: components["schemas"]["SaleMode"];
        };
        /** CraftScenarioOut */
        CraftScenarioOut: {
            acquisition_mode: components["schemas"]["AcquisitionMode"];
            sale_mode: components["schemas"]["SaleMode"];
            costs: components["schemas"]["CostBreakdownOut"];
            revenue: components["schemas"]["RevenueBreakdownOut"];
            /** Profit */
            profit: string | null;
            /** Profit Per Unit */
            profit_per_unit: string | null;
            /** Roi */
            roi: string | null;
            /** Warnings */
            warnings: components["schemas"]["CraftWarning"][];
        };
        /** CraftSimulationOut */
        CraftSimulationOut: {
            server: components["schemas"]["AlbionServer"];
            /** Output Item */
            output_item: string;
            /** Location Id */
            location_id: string;
            /** Output Quality */
            output_quality: number;
            /**
             * Scope
             * @enum {string}
             */
            scope: "all" | "mine";
            /** Requested Quantity */
            requested_quantity: number;
            /** Executions */
            executions: number;
            /** Produced Quantity */
            produced_quantity: number;
            /** Surplus Quantity */
            surplus_quantity: number;
            /** Return Rate */
            return_rate: string;
            /** Focus Consumed */
            focus_consumed: number;
            /** Premium */
            premium: boolean;
            /** Sales Tax Rate */
            sales_tax_rate: string;
            /** Setup Fee Rate */
            setup_fee_rate: string;
            recipe: components["schemas"]["RecipeSimulationOut"];
            /** Ingredients */
            ingredients: components["schemas"]["IngredientSimulationOut"][];
            output_quotes: components["schemas"]["OutputSaleQuotesOut"];
            /** Scenarios */
            scenarios: components["schemas"]["CraftScenarioOut"][];
        };
        /** CraftSimulationRequest */
        CraftSimulationRequest: {
            server: components["schemas"]["AlbionServer"];
            /** Output Item */
            output_item: string;
            /** Quantity */
            quantity: number;
            /**
             * Output Quality
             * @default 1
             */
            output_quality: number;
            /**
             * Scope
             * @default all
             * @enum {string}
             */
            scope: "all" | "mine";
            /**
             * Return Rate
             * @default 0
             */
            return_rate: number | string;
            /**
             * Station Cost Per Execution
             * @default 0
             */
            station_cost_per_execution: number | string;
            /**
             * Use Focus
             * @default false
             */
            use_focus: boolean;
            /**
             * Premium
             * @default true
             */
            premium: boolean;
            /** Sales Tax Rate */
            sales_tax_rate?: number | string | null;
            /** Setup Fee Rate */
            setup_fee_rate?: number | string | null;
            /** Ingredient Overrides */
            ingredient_overrides?: {
                [key: string]: components["schemas"]["IngredientOverride"];
            };
            /** Manual Prices */
            manual_prices?: {
                [key: string]: components["schemas"]["ManualPriceOverride"];
            };
            /** Location Id */
            location_id: string;
        };
        /**
         * CraftWarning
         * @description Stable warning identifiers returned by craft simulations.
         * @enum {string}
         */
        CraftWarning: "dado_velho" | "profundidade_insuficiente" | "sem_preco" | "sem_cobertura" | "ordem_nao_garantida";
        /**
         * DemandOut
         * @description Answers "how many people are buying this right now": ``book`` is demand parked in the
         *     request side of the order book, ``sold`` is real turnover over three windows, ``series_6h``
         *     is the raw series for plotting a trend. The view is global and does not inherit the
         *     ``scope`` of the prices endpoint.
         */
        DemandOut: {
            server: components["schemas"]["AlbionServer"];
            item: components["schemas"]["ItemSummary"];
            /** Location Id */
            location_id: string;
            book: components["schemas"]["BookOut"];
            sold: components["schemas"]["SoldOut"];
            /** Series 6H */
            series_6h: components["schemas"]["Series6hPoint"][];
        };
        /** ErrorModel */
        ErrorModel: {
            /** Detail */
            detail: string | {
                [key: string]: string;
            };
        };
        /** GoldPricesUploadIn */
        GoldPricesUploadIn: {
            /** Prices */
            Prices: number[];
            /** Timestamps */
            Timestamps: number[];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** IngredientOverride */
        IngredientOverride: {
            /**
             * Quality Level
             * @default 1
             */
            quality_level: number;
            /**
             * Return Eligible
             * @default true
             */
            return_eligible: boolean;
        };
        /** IngredientSimulationOut */
        IngredientSimulationOut: {
            /** Position */
            position: number;
            /** Unique Name */
            unique_name: string;
            /** Quality Level */
            quality_level: number;
            /** Count Per Execution */
            count_per_execution: number;
            /** Return Eligible */
            return_eligible: boolean;
            /** Gross Quantity */
            gross_quantity: number;
            /** Expected Return Quantity */
            expected_return_quantity: string;
            /** Effective Quantity */
            effective_quantity: string;
            /** Purchase Quantity */
            purchase_quantity: number;
            immediate_purchase: components["schemas"]["MarketQuoteOut"];
            buy_order: components["schemas"]["MarketQuoteOut"];
        };
        /** ItemCatalogOut */
        ItemCatalogOut: {
            /** Unique Name */
            unique_name: string;
            /** Albion Id */
            albion_id: number | null;
            /** Name Pt */
            name_pt: string | null;
            /** Name En */
            name_en: string | null;
            /** Tier */
            tier: number | null;
            /** Enchantment Level */
            enchantment_level: number;
            /** Shop Category */
            shop_category: string | null;
            /** Shop Subcategory */
            shop_subcategory: string | null;
            /** Shop Subcategory2 */
            shop_subcategory2: string | null;
            /** Shop Subcategory3 */
            shop_subcategory3: string | null;
            /** Has Recipe */
            has_recipe: boolean;
        };
        /**
         * ItemPricesOut
         * @description Global partial observations, or the combinations covered by the user, per ``scope``.
         *
         *     Under ``mine`` the book coverage and the history coverage are independent.
         */
        ItemPricesOut: {
            server: components["schemas"]["AlbionServer"];
            /** Item Id */
            item_id: string;
            /**
             * Scope
             * @enum {string}
             */
            scope: "all" | "mine";
            /** Prices */
            prices: components["schemas"]["LocationPrice"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
        };
        /** ItemSummary */
        ItemSummary: {
            /** Unique Name */
            unique_name: string;
            /** Name */
            name?: string | null;
        };
        /** LocationOut */
        LocationOut: {
            /** Location Id */
            location_id: string;
            /** Name */
            name: string | null;
            /** Display Name */
            display_name: string;
            /** Kind */
            kind: string;
            /** Is Royal City */
            is_royal_city: boolean;
        };
        /** LocationPrice */
        LocationPrice: {
            /** Location Id */
            location_id: string;
            /** Quality Level */
            quality_level: number;
            /** Enchantment Level */
            enchantment_level: number;
            sell: components["schemas"]["BookSide"];
            buy: components["schemas"]["BookSide"];
            sold_24h?: components["schemas"]["SoldVolume"] | null;
            /**
             * Coverage
             * @constant
             */
            coverage: "parcial";
            /** Freshness Window Seconds */
            freshness_window_seconds: number;
        };
        /**
         * ManualPriceOverride
         * @description Manual prices by market-book side.
         *
         *     ``offer`` replaces an ask (immediate acquisition / sell-order target); ``request`` replaces
         *     a bid (buy-order target / immediate sale).
         */
        ManualPriceOverride: {
            /** Offer */
            offer?: number | string | null;
            /** Request */
            request?: number | string | null;
        };
        /** MarketHistoriesUploadIn */
        MarketHistoriesUploadIn: {
            /** Albionid */
            AlbionId: number;
            /** Locationid */
            LocationId: string;
            /** Qualitylevel */
            QualityLevel: number;
            /** Timescale */
            Timescale: number;
            /** Markethistories */
            MarketHistories: components["schemas"]["MarketHistoryEntryIn"][];
        };
        /** MarketHistoryEntryIn */
        MarketHistoryEntryIn: {
            /** Itemamount */
            ItemAmount: number;
            /** Silveramount */
            SilverAmount: number;
            /** Timestamp */
            Timestamp: number;
        };
        /** MarketOrderIn */
        MarketOrderIn: {
            /** Id */
            Id: number;
            /** Itemtypeid */
            ItemTypeId: string;
            /** Itemgrouptypeid */
            ItemGroupTypeId: string;
            /** Locationid */
            LocationId: string;
            /** Qualitylevel */
            QualityLevel: number;
            /** Enchantmentlevel */
            EnchantmentLevel: number;
            /** Unitpricesilver */
            UnitPriceSilver: number;
            /** Amount */
            Amount: number;
            /**
             * Auctiontype
             * @enum {string}
             */
            AuctionType: "offer" | "request";
            /** Expires */
            Expires: string;
        };
        /** MarketQuoteOut */
        MarketQuoteOut: {
            /** Requested Quantity */
            requested_quantity: number;
            /** Priced Quantity */
            priced_quantity: number;
            /** Unit Price */
            unit_price: string | null;
            /** Total */
            total: string | null;
            /** Complete */
            complete: boolean;
            /** Guaranteed */
            guaranteed: boolean;
            /** Source */
            source: ("book" | "manual" | "book_suggestion") | null;
            /** Levels */
            levels: components["schemas"]["QuoteLevelOut"][];
            /** Warnings */
            warnings: components["schemas"]["CraftWarning"][];
            /** Oldest Observed At */
            oldest_observed_at?: string | null;
            /** Age Seconds */
            age_seconds?: number | null;
        };
        /** MarketUploadIn */
        MarketUploadIn: {
            /** Orders */
            Orders: components["schemas"]["MarketOrderIn"][];
        };
        /** OpportunityIngredientOut */
        OpportunityIngredientOut: {
            /** Item */
            item: string;
            /** Item Name */
            item_name?: string | null;
            /** Gross Quantity */
            gross_quantity: number;
            /** Expected Return Quantity */
            expected_return_quantity: string;
            /** Purchase Quantity */
            purchase_quantity: number;
        };
        /** OpportunityOut */
        OpportunityOut: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "flip" | "refining" | "crafting";
            /** Item */
            item: string;
            /** Item Name */
            item_name?: string | null;
            /** Quality Level */
            quality_level?: number | null;
            /** Buy Location */
            buy_location?: string | null;
            /** Sell Location */
            sell_location?: string | null;
            /** Buy Price */
            buy_price?: string | null;
            /** Sell Price */
            sell_price?: string | null;
            /**
             * Quantity
             * @default 0
             */
            quantity: number;
            /** Gross Revenue */
            gross_revenue?: string | null;
            /** Sales Tax */
            sales_tax?: string | null;
            /** Sale Setup Fee */
            sale_setup_fee?: string | null;
            /** Net Revenue */
            net_revenue?: string | null;
            /** Acquisition Setup Fee */
            acquisition_setup_fee?: string | null;
            /** Total Fees */
            total_fees?: string | null;
            /** Total Cost */
            total_cost?: string | null;
            /** Profit */
            profit?: string | null;
            /** Roi */
            roi?: string | null;
            /** Acquisition Mode */
            acquisition_mode?: ("immediate" | "buy_order") | null;
            /** Sale Mode */
            sale_mode?: ("immediate" | "sell_order") | null;
            /** Price Model */
            price_model?: ("top_of_book" | "neutral_ranking") | null;
            /** Ingredients */
            ingredients?: components["schemas"]["OpportunityIngredientOut"][];
            /** Station Cost */
            station_cost?: string | null;
            /** Focus Consumed */
            focus_consumed?: number | null;
            /** Oldest Observed At */
            oldest_observed_at?: string | null;
            /** Warnings */
            warnings?: string[];
            components?: components["schemas"]["RankingComponentsOut"] | null;
        };
        /** OpportunityPage */
        OpportunityPage: {
            server: components["schemas"]["AlbionServer"];
            /**
             * Kind
             * @enum {string}
             */
            kind: "flip" | "refining" | "crafting";
            /** Opportunities */
            opportunities: components["schemas"]["OpportunityOut"][];
            /** Total */
            total: number;
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            coverage?: components["schemas"]["RankingCoverage"] | null;
        };
        /** OutputSaleQuotesOut */
        OutputSaleQuotesOut: {
            immediate_sale: components["schemas"]["MarketQuoteOut"];
            sell_order: components["schemas"]["MarketQuoteOut"];
        };
        /**
         * PriceSnapshotColumnsOut
         * @description Arrays paralelos: o índice `i` de cada array descreve a mesma linha.
         *
         *     ``item`` e ``location`` são **índices** em ``PriceSnapshotOut.items`` / ``.locations``;
         *     ``sell_source``/``buy_source`` são índices em ``.sources``. Os ``observed_at`` são **epoch
         *     em segundos** (inteiro), não ISO — ISO custa 29 caracteres por lado, por linha.
         *
         *     ``null`` em qualquer lado significa **ausência de preço**, nunca preço zero.
         */
        PriceSnapshotColumnsOut: {
            /** Item */
            item: number[];
            /** Location */
            location: number[];
            /** Quality */
            quality: number[];
            /** Enchantment */
            enchantment: number[];
            /** Sell Min */
            sell_min: (string | null)[];
            /** Sell Observed At */
            sell_observed_at: (number | null)[];
            /** Sell Source */
            sell_source: (number | null)[];
            /** Buy Max */
            buy_max: (string | null)[];
            /** Buy Observed At */
            buy_observed_at: (number | null)[];
            /** Buy Source */
            buy_source: (number | null)[];
        };
        /**
         * PriceSnapshotOut
         * @description Snapshot de um realm. **Sem filtro de frescor e sem paginação** — a idade viaja em cada
         *     linha e quem decide o que esconder é a tela (`X02`).
         *
         *     **Formato colunar, por medição.** A versão legível (array de objetos) custou 23 B/linha
         *     gzipped, o que extrapola para ~67 KB numa cidade e ~560 KB nas oito — caro demais para algo
         *     que o cliente busca a cada 30 s. Trocar chaves repetidas por arrays, strings por índices de
         *     dicionário e ISO por epoch resolve isso. Os números medidos estão no estado da task 4/03.
         *
         *     Preço continua **string decimal** (`F09`) — a compactação não passa por cima da regra do
         *     dinheiro.
         */
        PriceSnapshotOut: {
            server: components["schemas"]["AlbionServer"];
            /**
             * Generated At
             * Format: date-time
             */
            generated_at: string;
            /** Row Count */
            row_count: number;
            /** Items */
            items: string[];
            /** Locations */
            locations: string[];
            /** Sources */
            sources: string[];
            columns: components["schemas"]["PriceSnapshotColumnsOut"];
        };
        /** QuoteLevelOut */
        QuoteLevelOut: {
            /** Unit Price */
            unit_price: string;
            /** Quantity */
            quantity: number;
            /** Subtotal */
            subtotal: string;
            /** Observed At */
            observed_at?: string | null;
        };
        /**
         * RankingComponentsOut
         * @description Componentes neutros de uma linha do ranking materializado (task 3.5/23).
         *
         *     Premium, imposto, taxa de retorno, custo de estação e foco são transformações baratas
         *     sobre estes números — o cliente as aplica na hora (`src/lib/ranking-projection.ts`), sem
         *     round-trip. O que o servidor faz é a varredura (avaliar milhares de receitas contra o
         *     livro); o que ele não precisa fazer é multiplicar por 0,96 a cada tecla.
         */
        RankingComponentsOut: {
            /** Recipe Silver Cost */
            recipe_silver_cost: number;
            /** Crafting Focus */
            crafting_focus: number;
            /** Executions */
            executions: number;
            /** Produced Quantity */
            produced_quantity: number;
            /** Ingredient Cost Immediate */
            ingredient_cost_immediate?: string | null;
            /** Ingredient Cost Order */
            ingredient_cost_order?: string | null;
            /** Output Gross Immediate */
            output_gross_immediate?: string | null;
            /** Output Gross Order */
            output_gross_order?: string | null;
            /** Ingredients Oldest Observed At */
            ingredients_oldest_observed_at?: string | null;
            /** Output Immediate Observed At */
            output_immediate_observed_at?: string | null;
            /** Output Order Observed At */
            output_order_observed_at?: string | null;
        };
        /**
         * RankingCoverage
         * @description Cobertura da última reconstrução do ranking materializado, para a UI nunca esconder
         *     truncamento (``B02``).
         */
        RankingCoverage: {
            /** Evaluated Recipes */
            evaluated_recipes: number;
            /** Priced Recipes */
            priced_recipes: number;
            /** Total Recipes */
            total_recipes: number;
            /** Computed At */
            computed_at?: string | null;
            /** Stale */
            stale: boolean;
        };
        /** RecipeIngredientOut */
        RecipeIngredientOut: {
            /** Unique Name */
            unique_name: string;
            /** Albion Id */
            albion_id: number | null;
            /** Name Pt */
            name_pt: string | null;
            /** Name En */
            name_en: string | null;
            /** Position */
            position: number;
            /** Count */
            count: number;
            /** Enchantment Level */
            enchantment_level: number;
            /** Has Own Recipe */
            has_own_recipe: boolean;
        };
        /** RecipeItemOut */
        RecipeItemOut: {
            /** Unique Name */
            unique_name: string;
            /** Albion Id */
            albion_id: number | null;
            /** Name Pt */
            name_pt: string | null;
            /** Name En */
            name_en: string | null;
        };
        /** RecipeOut */
        RecipeOut: {
            output: components["schemas"]["RecipeItemOut"];
            /** Enchantment Level */
            enchantment_level: number;
            /**
             * Production Kind
             * @enum {string}
             */
            production_kind: "refining" | "crafting";
            /** Silver Cost */
            silver_cost: number;
            /** Crafting Focus */
            crafting_focus: number;
            /** Amount Crafted */
            amount_crafted: number;
            /** Craft Time */
            craft_time: string;
            /** Ingredients */
            ingredients: components["schemas"]["RecipeIngredientOut"][];
            upgrade_resource: components["schemas"]["RecipeUpgradeResourceOut"] | null;
            /** Enchanted Variants */
            enchanted_variants: string[];
        };
        /** RecipeSimulationOut */
        RecipeSimulationOut: {
            /** Silver Cost Per Execution */
            silver_cost_per_execution: number;
            /** Crafting Focus Per Execution */
            crafting_focus_per_execution: number;
            /** Amount Crafted */
            amount_crafted: number;
        };
        /** RecipeUpgradeResourceOut */
        RecipeUpgradeResourceOut: {
            /** Unique Name */
            unique_name: string;
            /** Albion Id */
            albion_id: number | null;
            /** Name Pt */
            name_pt: string | null;
            /** Name En */
            name_en: string | null;
            /** Count */
            count: number;
        };
        /** RevenueBreakdownOut */
        RevenueBreakdownOut: {
            /** Gross Revenue */
            gross_revenue: string | null;
            /** Sales Tax */
            sales_tax: string | null;
            /** Sale Setup Fee */
            sale_setup_fee: string | null;
            /** Net Revenue */
            net_revenue: string | null;
        };
        /**
         * SaleMode
         * @description How crafted output is sold.
         * @enum {string}
         */
        SaleMode: "immediate" | "sell_order";
        /** Series6hPoint */
        Series6hPoint: {
            /**
             * Start
             * Format: date-time
             */
            start: string;
            /** Units */
            units: number;
            /** Average Price */
            average_price?: string | null;
        };
        /** SoldOut */
        SoldOut: {
            last_24h: components["schemas"]["SoldVolume"];
            last_7d: components["schemas"]["SoldVolume"];
            last_30d: components["schemas"]["SoldVolume"];
        };
        /**
         * SoldVolume
         * @description Real turnover, from ``markethistories.ingest`` — the price actually transacted, not what
         *     someone is asking for in the book.
         */
        SoldVolume: {
            /** Units */
            units: number;
            /** Average Price */
            average_price?: string | null;
        };
        /** UpgradeStepOut */
        UpgradeStepOut: {
            /** From Level */
            from_level: number;
            /** To Level */
            to_level: number;
            /** Resource Item */
            resource_item: string;
            /** Resource Count Per Item */
            resource_count_per_item: number;
            /** Quantity */
            quantity: number;
        };
        /** UserCreate */
        UserCreate: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Password */
            password: string;
            /**
             * Is Active
             * @default true
             */
            is_active: boolean | null;
            /**
             * Is Superuser
             * @default false
             */
            is_superuser: boolean | null;
            /**
             * Is Verified
             * @default false
             */
            is_verified: boolean | null;
        };
        /** UserRead */
        UserRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Is Active
             * @default true
             */
            is_active: boolean;
            /**
             * Is Superuser
             * @default false
             */
            is_superuser: boolean;
            /**
             * Is Verified
             * @default false
             */
            is_verified: boolean;
        };
        /** UserUpdate */
        UserUpdate: {
            /** Password */
            password?: string | null;
            /** Email */
            email?: string | null;
            /** Is Active */
            is_active?: boolean | null;
            /** Is Superuser */
            is_superuser?: boolean | null;
            /** Is Verified */
            is_verified?: boolean | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    list_api_tokens_auth_tokens_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiTokenPublic"][];
                };
            };
        };
    };
    create_api_token_auth_tokens_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiTokenCreated"];
                };
            };
        };
    };
    delete_api_token_auth_tokens__token_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    auth_jwt_login_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["Body_auth_jwt_login_auth_login_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiOTIyMWZmYzktNjQwZi00MzcyLTg2ZDMtY2U2NDJjYmE1NjAzIiwiYXVkIjoiZmFzdGFwaS11c2VyczphdXRoIiwiZXhwIjoxNTcxNTA0MTkzfQ.M10bjOe45I5Ncu_uXvOmVV8QxnL-nZfcH96U90JaocI",
                     *       "token_type": "bearer"
                     *     }
                     */
                    "application/json": components["schemas"]["BearerResponse"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorModel"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    auth_jwt_logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Missing token or inactive user. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    register_register_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorModel"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    users_current_user_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Missing token or inactive user. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    users_patch_current_user_auth_me_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorModel"];
                };
            };
            /** @description Missing token or inactive user. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    users_user_auth__id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Missing token or inactive user. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not a superuser. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The user does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    users_delete_user_auth__id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing token or inactive user. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not a superuser. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The user does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    users_patch_user_auth__id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserRead"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorModel"];
                };
            };
            /** @description Missing token or inactive user. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not a superuser. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The user does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    client_me_client_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClientIdentity"];
                };
            };
        };
    };
    ingest_market_orders_marketorders_ingest_post: {
        parameters: {
            query?: never;
            header: {
                "X-Albion-Server": components["schemas"]["AlbionServer"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarketUploadIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_market_history_markethistories_ingest_post: {
        parameters: {
            query?: never;
            header: {
                "X-Albion-Server": components["schemas"]["AlbionServer"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarketHistoriesUploadIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_gold_prices_goldprices_ingest_post: {
        parameters: {
            query?: never;
            header: {
                "X-Albion-Server": components["schemas"]["AlbionServer"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GoldPricesUploadIn"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_mapdata_descartado_mapdata_ingest_post: {
        parameters: {
            query?: never;
            header: {
                "X-Albion-Server": components["schemas"]["AlbionServer"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_banditevent_descartado_banditevent_ingest_post: {
        parameters: {
            query?: never;
            header: {
                "X-Albion-Server": components["schemas"]["AlbionServer"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ingest_festivities_descartado_festivities_ingest_post: {
        parameters: {
            query?: never;
            header: {
                "X-Albion-Server": components["schemas"]["AlbionServer"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_recipe_items__unique_name__recipe_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                unique_name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecipeOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_item_catalog_items_search_get: {
        parameters: {
            query: {
                q: string;
                tier?: number | null;
                enchantment_level?: number | null;
                categoria?: string | null;
                apenas_craftaveis?: boolean;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemCatalogOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_locations_locations_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationOut"][];
                };
            };
        };
    };
    read_categories_items_categories_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryOut"][];
                };
            };
        };
    };
    read_item_items__unique_name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                unique_name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemCatalogOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_recipe_catalog_catalog_recipes_get: {
        parameters: {
            query?: {
                kind?: ("refining" | "crafting") | null;
            };
            header?: {
                "If-None-Match"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogRecipesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_price_snapshot_prices_snapshot_get: {
        parameters: {
            query: {
                server: components["schemas"]["AlbionServer"];
                location_id?: string[] | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PriceSnapshotOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_item_prices_items__item_id__prices_get: {
        parameters: {
            query: {
                server: components["schemas"]["AlbionServer"];
                scope?: "all" | "mine";
                location_id?: string[] | null;
                quality_level?: number | null;
                enchantment_level?: number | null;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemPricesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_item_demand_items__item_id__demand_get: {
        parameters: {
            query: {
                server: components["schemas"]["AlbionServer"];
                location_id: string;
                quality: number;
                enchantment_level?: number;
            };
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DemandOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    simulate_craft_simulate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CraftSimulationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CraftSimulationOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    compare_craft_compare_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CraftCompareRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CraftCompareOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    flips_opportunities_flips_get: {
        parameters: {
            query: {
                server: components["schemas"]["AlbionServer"];
                item_id?: string | null;
                category?: string | null;
                subcategory?: string | null;
                subcategory2?: string | null;
                subcategory3?: string | null;
                location_id?: string[] | null;
                tier?: number | null;
                enchantment_level?: number | null;
                quality_level?: number | null;
                max_age_hours?: number | null;
                require_complete?: boolean;
                limit?: number;
                offset?: number;
                min_profit?: number | string | null;
                min_roi?: number | string | null;
                premium?: boolean;
                buy_order?: boolean;
                sell_order?: boolean;
                sort?: "profit" | "roi" | "freshness";
                direction?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refining_opportunities_refining_get: {
        parameters: {
            query: {
                server: components["schemas"]["AlbionServer"];
                item_id?: string | null;
                location_id?: string[] | null;
                tier?: number | null;
                enchantment_level?: number | null;
                quality_level?: number | null;
                max_age_hours?: number | null;
                require_complete?: boolean;
                limit?: number;
                offset?: number;
                min_profit?: number | string | null;
                min_roi?: number | string | null;
                return_rate?: number | string;
                station_cost_per_execution?: number | string;
                use_focus?: boolean;
                premium?: boolean;
                sort?: "profit" | "roi" | "freshness";
                direction?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    crafting_opportunities_crafting_get: {
        parameters: {
            query: {
                server: components["schemas"]["AlbionServer"];
                item_id?: string | null;
                location_id?: string[] | null;
                tier?: number | null;
                enchantment_level?: number | null;
                quality_level?: number | null;
                max_age_hours?: number | null;
                require_complete?: boolean;
                limit?: number;
                offset?: number;
                min_profit?: number | string | null;
                min_roi?: number | string | null;
                return_rate?: number | string;
                station_cost_per_execution?: number | string;
                use_focus?: boolean;
                premium?: boolean;
                sort?: "profit" | "roi" | "freshness";
                direction?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpportunityPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    health_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    ready_ready_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
}

