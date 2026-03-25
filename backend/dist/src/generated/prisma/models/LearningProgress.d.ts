import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model LearningProgress
 *
 */
export type LearningProgressModel = runtime.Types.Result.DefaultSelection<Prisma.$LearningProgressPayload>;
export type AggregateLearningProgress = {
    _count: LearningProgressCountAggregateOutputType | null;
    _avg: LearningProgressAvgAggregateOutputType | null;
    _sum: LearningProgressSumAggregateOutputType | null;
    _min: LearningProgressMinAggregateOutputType | null;
    _max: LearningProgressMaxAggregateOutputType | null;
};
export type LearningProgressAvgAggregateOutputType = {
    percentage: number | null;
};
export type LearningProgressSumAggregateOutputType = {
    percentage: number | null;
};
export type LearningProgressMinAggregateOutputType = {
    id: string | null;
    userId: string | null;
    currentModule: string | null;
    percentage: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type LearningProgressMaxAggregateOutputType = {
    id: string | null;
    userId: string | null;
    currentModule: string | null;
    percentage: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type LearningProgressCountAggregateOutputType = {
    id: number;
    userId: number;
    completedLessons: number;
    currentModule: number;
    percentage: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type LearningProgressAvgAggregateInputType = {
    percentage?: true;
};
export type LearningProgressSumAggregateInputType = {
    percentage?: true;
};
export type LearningProgressMinAggregateInputType = {
    id?: true;
    userId?: true;
    currentModule?: true;
    percentage?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type LearningProgressMaxAggregateInputType = {
    id?: true;
    userId?: true;
    currentModule?: true;
    percentage?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type LearningProgressCountAggregateInputType = {
    id?: true;
    userId?: true;
    completedLessons?: true;
    currentModule?: true;
    percentage?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type LearningProgressAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which LearningProgress to aggregate.
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of LearningProgresses to fetch.
     */
    orderBy?: Prisma.LearningProgressOrderByWithRelationInput | Prisma.LearningProgressOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.LearningProgressWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` LearningProgresses from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` LearningProgresses.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned LearningProgresses
    **/
    _count?: true | LearningProgressCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: LearningProgressAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: LearningProgressSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: LearningProgressMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: LearningProgressMaxAggregateInputType;
};
export type GetLearningProgressAggregateType<T extends LearningProgressAggregateArgs> = {
    [P in keyof T & keyof AggregateLearningProgress]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateLearningProgress[P]> : Prisma.GetScalarType<T[P], AggregateLearningProgress[P]>;
};
export type LearningProgressGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.LearningProgressWhereInput;
    orderBy?: Prisma.LearningProgressOrderByWithAggregationInput | Prisma.LearningProgressOrderByWithAggregationInput[];
    by: Prisma.LearningProgressScalarFieldEnum[] | Prisma.LearningProgressScalarFieldEnum;
    having?: Prisma.LearningProgressScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: LearningProgressCountAggregateInputType | true;
    _avg?: LearningProgressAvgAggregateInputType;
    _sum?: LearningProgressSumAggregateInputType;
    _min?: LearningProgressMinAggregateInputType;
    _max?: LearningProgressMaxAggregateInputType;
};
export type LearningProgressGroupByOutputType = {
    id: string;
    userId: string;
    completedLessons: string[];
    currentModule: string;
    percentage: number;
    createdAt: Date;
    updatedAt: Date;
    _count: LearningProgressCountAggregateOutputType | null;
    _avg: LearningProgressAvgAggregateOutputType | null;
    _sum: LearningProgressSumAggregateOutputType | null;
    _min: LearningProgressMinAggregateOutputType | null;
    _max: LearningProgressMaxAggregateOutputType | null;
};
type GetLearningProgressGroupByPayload<T extends LearningProgressGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<LearningProgressGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof LearningProgressGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], LearningProgressGroupByOutputType[P]> : Prisma.GetScalarType<T[P], LearningProgressGroupByOutputType[P]>;
}>>;
export type LearningProgressWhereInput = {
    AND?: Prisma.LearningProgressWhereInput | Prisma.LearningProgressWhereInput[];
    OR?: Prisma.LearningProgressWhereInput[];
    NOT?: Prisma.LearningProgressWhereInput | Prisma.LearningProgressWhereInput[];
    id?: Prisma.StringFilter<"LearningProgress"> | string;
    userId?: Prisma.StringFilter<"LearningProgress"> | string;
    completedLessons?: Prisma.StringNullableListFilter<"LearningProgress">;
    currentModule?: Prisma.StringFilter<"LearningProgress"> | string;
    percentage?: Prisma.IntFilter<"LearningProgress"> | number;
    createdAt?: Prisma.DateTimeFilter<"LearningProgress"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"LearningProgress"> | Date | string;
};
export type LearningProgressOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    completedLessons?: Prisma.SortOrder;
    currentModule?: Prisma.SortOrder;
    percentage?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type LearningProgressWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    userId?: string;
    AND?: Prisma.LearningProgressWhereInput | Prisma.LearningProgressWhereInput[];
    OR?: Prisma.LearningProgressWhereInput[];
    NOT?: Prisma.LearningProgressWhereInput | Prisma.LearningProgressWhereInput[];
    completedLessons?: Prisma.StringNullableListFilter<"LearningProgress">;
    currentModule?: Prisma.StringFilter<"LearningProgress"> | string;
    percentage?: Prisma.IntFilter<"LearningProgress"> | number;
    createdAt?: Prisma.DateTimeFilter<"LearningProgress"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"LearningProgress"> | Date | string;
}, "id" | "userId">;
export type LearningProgressOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    completedLessons?: Prisma.SortOrder;
    currentModule?: Prisma.SortOrder;
    percentage?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.LearningProgressCountOrderByAggregateInput;
    _avg?: Prisma.LearningProgressAvgOrderByAggregateInput;
    _max?: Prisma.LearningProgressMaxOrderByAggregateInput;
    _min?: Prisma.LearningProgressMinOrderByAggregateInput;
    _sum?: Prisma.LearningProgressSumOrderByAggregateInput;
};
export type LearningProgressScalarWhereWithAggregatesInput = {
    AND?: Prisma.LearningProgressScalarWhereWithAggregatesInput | Prisma.LearningProgressScalarWhereWithAggregatesInput[];
    OR?: Prisma.LearningProgressScalarWhereWithAggregatesInput[];
    NOT?: Prisma.LearningProgressScalarWhereWithAggregatesInput | Prisma.LearningProgressScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"LearningProgress"> | string;
    userId?: Prisma.StringWithAggregatesFilter<"LearningProgress"> | string;
    completedLessons?: Prisma.StringNullableListFilter<"LearningProgress">;
    currentModule?: Prisma.StringWithAggregatesFilter<"LearningProgress"> | string;
    percentage?: Prisma.IntWithAggregatesFilter<"LearningProgress"> | number;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"LearningProgress"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"LearningProgress"> | Date | string;
};
export type LearningProgressCreateInput = {
    id?: string;
    userId: string;
    completedLessons?: Prisma.LearningProgressCreatecompletedLessonsInput | string[];
    currentModule?: string;
    percentage?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type LearningProgressUncheckedCreateInput = {
    id?: string;
    userId: string;
    completedLessons?: Prisma.LearningProgressCreatecompletedLessonsInput | string[];
    currentModule?: string;
    percentage?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type LearningProgressUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    completedLessons?: Prisma.LearningProgressUpdatecompletedLessonsInput | string[];
    currentModule?: Prisma.StringFieldUpdateOperationsInput | string;
    percentage?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type LearningProgressUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    completedLessons?: Prisma.LearningProgressUpdatecompletedLessonsInput | string[];
    currentModule?: Prisma.StringFieldUpdateOperationsInput | string;
    percentage?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type LearningProgressCreateManyInput = {
    id?: string;
    userId: string;
    completedLessons?: Prisma.LearningProgressCreatecompletedLessonsInput | string[];
    currentModule?: string;
    percentage?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type LearningProgressUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    completedLessons?: Prisma.LearningProgressUpdatecompletedLessonsInput | string[];
    currentModule?: Prisma.StringFieldUpdateOperationsInput | string;
    percentage?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type LearningProgressUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    userId?: Prisma.StringFieldUpdateOperationsInput | string;
    completedLessons?: Prisma.LearningProgressUpdatecompletedLessonsInput | string[];
    currentModule?: Prisma.StringFieldUpdateOperationsInput | string;
    percentage?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type StringNullableListFilter<$PrismaModel = never> = {
    equals?: string[] | Prisma.ListStringFieldRefInput<$PrismaModel> | null;
    has?: string | Prisma.StringFieldRefInput<$PrismaModel> | null;
    hasEvery?: string[] | Prisma.ListStringFieldRefInput<$PrismaModel>;
    hasSome?: string[] | Prisma.ListStringFieldRefInput<$PrismaModel>;
    isEmpty?: boolean;
};
export type LearningProgressCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    completedLessons?: Prisma.SortOrder;
    currentModule?: Prisma.SortOrder;
    percentage?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type LearningProgressAvgOrderByAggregateInput = {
    percentage?: Prisma.SortOrder;
};
export type LearningProgressMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    currentModule?: Prisma.SortOrder;
    percentage?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type LearningProgressMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    userId?: Prisma.SortOrder;
    currentModule?: Prisma.SortOrder;
    percentage?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type LearningProgressSumOrderByAggregateInput = {
    percentage?: Prisma.SortOrder;
};
export type LearningProgressCreatecompletedLessonsInput = {
    set: string[];
};
export type LearningProgressUpdatecompletedLessonsInput = {
    set?: string[];
    push?: string | string[];
};
export type LearningProgressSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    completedLessons?: boolean;
    currentModule?: boolean;
    percentage?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["learningProgress"]>;
export type LearningProgressSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    completedLessons?: boolean;
    currentModule?: boolean;
    percentage?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["learningProgress"]>;
export type LearningProgressSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    userId?: boolean;
    completedLessons?: boolean;
    currentModule?: boolean;
    percentage?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["learningProgress"]>;
export type LearningProgressSelectScalar = {
    id?: boolean;
    userId?: boolean;
    completedLessons?: boolean;
    currentModule?: boolean;
    percentage?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type LearningProgressOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "userId" | "completedLessons" | "currentModule" | "percentage" | "createdAt" | "updatedAt", ExtArgs["result"]["learningProgress"]>;
export type $LearningProgressPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "LearningProgress";
    objects: {};
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        userId: string;
        completedLessons: string[];
        currentModule: string;
        percentage: number;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["learningProgress"]>;
    composites: {};
};
export type LearningProgressGetPayload<S extends boolean | null | undefined | LearningProgressDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload, S>;
export type LearningProgressCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<LearningProgressFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: LearningProgressCountAggregateInputType | true;
};
export interface LearningProgressDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['LearningProgress'];
        meta: {
            name: 'LearningProgress';
        };
    };
    /**
     * Find zero or one LearningProgress that matches the filter.
     * @param {LearningProgressFindUniqueArgs} args - Arguments to find a LearningProgress
     * @example
     * // Get one LearningProgress
     * const learningProgress = await prisma.learningProgress.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends LearningProgressFindUniqueArgs>(args: Prisma.SelectSubset<T, LearningProgressFindUniqueArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one LearningProgress that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {LearningProgressFindUniqueOrThrowArgs} args - Arguments to find a LearningProgress
     * @example
     * // Get one LearningProgress
     * const learningProgress = await prisma.learningProgress.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends LearningProgressFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, LearningProgressFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first LearningProgress that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressFindFirstArgs} args - Arguments to find a LearningProgress
     * @example
     * // Get one LearningProgress
     * const learningProgress = await prisma.learningProgress.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends LearningProgressFindFirstArgs>(args?: Prisma.SelectSubset<T, LearningProgressFindFirstArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first LearningProgress that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressFindFirstOrThrowArgs} args - Arguments to find a LearningProgress
     * @example
     * // Get one LearningProgress
     * const learningProgress = await prisma.learningProgress.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends LearningProgressFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, LearningProgressFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more LearningProgresses that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all LearningProgresses
     * const learningProgresses = await prisma.learningProgress.findMany()
     *
     * // Get first 10 LearningProgresses
     * const learningProgresses = await prisma.learningProgress.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const learningProgressWithIdOnly = await prisma.learningProgress.findMany({ select: { id: true } })
     *
     */
    findMany<T extends LearningProgressFindManyArgs>(args?: Prisma.SelectSubset<T, LearningProgressFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a LearningProgress.
     * @param {LearningProgressCreateArgs} args - Arguments to create a LearningProgress.
     * @example
     * // Create one LearningProgress
     * const LearningProgress = await prisma.learningProgress.create({
     *   data: {
     *     // ... data to create a LearningProgress
     *   }
     * })
     *
     */
    create<T extends LearningProgressCreateArgs>(args: Prisma.SelectSubset<T, LearningProgressCreateArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many LearningProgresses.
     * @param {LearningProgressCreateManyArgs} args - Arguments to create many LearningProgresses.
     * @example
     * // Create many LearningProgresses
     * const learningProgress = await prisma.learningProgress.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends LearningProgressCreateManyArgs>(args?: Prisma.SelectSubset<T, LearningProgressCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many LearningProgresses and returns the data saved in the database.
     * @param {LearningProgressCreateManyAndReturnArgs} args - Arguments to create many LearningProgresses.
     * @example
     * // Create many LearningProgresses
     * const learningProgress = await prisma.learningProgress.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many LearningProgresses and only return the `id`
     * const learningProgressWithIdOnly = await prisma.learningProgress.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends LearningProgressCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, LearningProgressCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a LearningProgress.
     * @param {LearningProgressDeleteArgs} args - Arguments to delete one LearningProgress.
     * @example
     * // Delete one LearningProgress
     * const LearningProgress = await prisma.learningProgress.delete({
     *   where: {
     *     // ... filter to delete one LearningProgress
     *   }
     * })
     *
     */
    delete<T extends LearningProgressDeleteArgs>(args: Prisma.SelectSubset<T, LearningProgressDeleteArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one LearningProgress.
     * @param {LearningProgressUpdateArgs} args - Arguments to update one LearningProgress.
     * @example
     * // Update one LearningProgress
     * const learningProgress = await prisma.learningProgress.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends LearningProgressUpdateArgs>(args: Prisma.SelectSubset<T, LearningProgressUpdateArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more LearningProgresses.
     * @param {LearningProgressDeleteManyArgs} args - Arguments to filter LearningProgresses to delete.
     * @example
     * // Delete a few LearningProgresses
     * const { count } = await prisma.learningProgress.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends LearningProgressDeleteManyArgs>(args?: Prisma.SelectSubset<T, LearningProgressDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more LearningProgresses.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many LearningProgresses
     * const learningProgress = await prisma.learningProgress.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends LearningProgressUpdateManyArgs>(args: Prisma.SelectSubset<T, LearningProgressUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more LearningProgresses and returns the data updated in the database.
     * @param {LearningProgressUpdateManyAndReturnArgs} args - Arguments to update many LearningProgresses.
     * @example
     * // Update many LearningProgresses
     * const learningProgress = await prisma.learningProgress.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more LearningProgresses and only return the `id`
     * const learningProgressWithIdOnly = await prisma.learningProgress.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    updateManyAndReturn<T extends LearningProgressUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, LearningProgressUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one LearningProgress.
     * @param {LearningProgressUpsertArgs} args - Arguments to update or create a LearningProgress.
     * @example
     * // Update or create a LearningProgress
     * const learningProgress = await prisma.learningProgress.upsert({
     *   create: {
     *     // ... data to create a LearningProgress
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the LearningProgress we want to update
     *   }
     * })
     */
    upsert<T extends LearningProgressUpsertArgs>(args: Prisma.SelectSubset<T, LearningProgressUpsertArgs<ExtArgs>>): Prisma.Prisma__LearningProgressClient<runtime.Types.Result.GetResult<Prisma.$LearningProgressPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of LearningProgresses.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressCountArgs} args - Arguments to filter LearningProgresses to count.
     * @example
     * // Count the number of LearningProgresses
     * const count = await prisma.learningProgress.count({
     *   where: {
     *     // ... the filter for the LearningProgresses we want to count
     *   }
     * })
    **/
    count<T extends LearningProgressCountArgs>(args?: Prisma.Subset<T, LearningProgressCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], LearningProgressCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a LearningProgress.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LearningProgressAggregateArgs>(args: Prisma.Subset<T, LearningProgressAggregateArgs>): Prisma.PrismaPromise<GetLearningProgressAggregateType<T>>;
    /**
     * Group by LearningProgress.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LearningProgressGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
    **/
    groupBy<T extends LearningProgressGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: LearningProgressGroupByArgs['orderBy'];
    } : {
        orderBy?: LearningProgressGroupByArgs['orderBy'];
    }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True ? `Error: "by" must not be empty.` : HavingValid extends Prisma.False ? {
        [P in HavingFields]: P extends ByFields ? never : P extends string ? `Error: Field "${P}" used in "having" needs to be provided in "by".` : [
            Error,
            'Field ',
            P,
            ` in "having" needs to be provided in "by"`
        ];
    }[HavingFields] : 'take' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "take", you also need to provide "orderBy"' : 'skip' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "skip", you also need to provide "orderBy"' : ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, LearningProgressGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLearningProgressGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the LearningProgress model
     */
    readonly fields: LearningProgressFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for LearningProgress.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__LearningProgressClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
/**
 * Fields of the LearningProgress model
 */
export interface LearningProgressFieldRefs {
    readonly id: Prisma.FieldRef<"LearningProgress", 'String'>;
    readonly userId: Prisma.FieldRef<"LearningProgress", 'String'>;
    readonly completedLessons: Prisma.FieldRef<"LearningProgress", 'String[]'>;
    readonly currentModule: Prisma.FieldRef<"LearningProgress", 'String'>;
    readonly percentage: Prisma.FieldRef<"LearningProgress", 'Int'>;
    readonly createdAt: Prisma.FieldRef<"LearningProgress", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"LearningProgress", 'DateTime'>;
}
/**
 * LearningProgress findUnique
 */
export type LearningProgressFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * Filter, which LearningProgress to fetch.
     */
    where: Prisma.LearningProgressWhereUniqueInput;
};
/**
 * LearningProgress findUniqueOrThrow
 */
export type LearningProgressFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * Filter, which LearningProgress to fetch.
     */
    where: Prisma.LearningProgressWhereUniqueInput;
};
/**
 * LearningProgress findFirst
 */
export type LearningProgressFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * Filter, which LearningProgress to fetch.
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of LearningProgresses to fetch.
     */
    orderBy?: Prisma.LearningProgressOrderByWithRelationInput | Prisma.LearningProgressOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for LearningProgresses.
     */
    cursor?: Prisma.LearningProgressWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` LearningProgresses from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` LearningProgresses.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of LearningProgresses.
     */
    distinct?: Prisma.LearningProgressScalarFieldEnum | Prisma.LearningProgressScalarFieldEnum[];
};
/**
 * LearningProgress findFirstOrThrow
 */
export type LearningProgressFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * Filter, which LearningProgress to fetch.
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of LearningProgresses to fetch.
     */
    orderBy?: Prisma.LearningProgressOrderByWithRelationInput | Prisma.LearningProgressOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for LearningProgresses.
     */
    cursor?: Prisma.LearningProgressWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` LearningProgresses from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` LearningProgresses.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of LearningProgresses.
     */
    distinct?: Prisma.LearningProgressScalarFieldEnum | Prisma.LearningProgressScalarFieldEnum[];
};
/**
 * LearningProgress findMany
 */
export type LearningProgressFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * Filter, which LearningProgresses to fetch.
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of LearningProgresses to fetch.
     */
    orderBy?: Prisma.LearningProgressOrderByWithRelationInput | Prisma.LearningProgressOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing LearningProgresses.
     */
    cursor?: Prisma.LearningProgressWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` LearningProgresses from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` LearningProgresses.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of LearningProgresses.
     */
    distinct?: Prisma.LearningProgressScalarFieldEnum | Prisma.LearningProgressScalarFieldEnum[];
};
/**
 * LearningProgress create
 */
export type LearningProgressCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * The data needed to create a LearningProgress.
     */
    data: Prisma.XOR<Prisma.LearningProgressCreateInput, Prisma.LearningProgressUncheckedCreateInput>;
};
/**
 * LearningProgress createMany
 */
export type LearningProgressCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many LearningProgresses.
     */
    data: Prisma.LearningProgressCreateManyInput | Prisma.LearningProgressCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * LearningProgress createManyAndReturn
 */
export type LearningProgressCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * The data used to create many LearningProgresses.
     */
    data: Prisma.LearningProgressCreateManyInput | Prisma.LearningProgressCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * LearningProgress update
 */
export type LearningProgressUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * The data needed to update a LearningProgress.
     */
    data: Prisma.XOR<Prisma.LearningProgressUpdateInput, Prisma.LearningProgressUncheckedUpdateInput>;
    /**
     * Choose, which LearningProgress to update.
     */
    where: Prisma.LearningProgressWhereUniqueInput;
};
/**
 * LearningProgress updateMany
 */
export type LearningProgressUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update LearningProgresses.
     */
    data: Prisma.XOR<Prisma.LearningProgressUpdateManyMutationInput, Prisma.LearningProgressUncheckedUpdateManyInput>;
    /**
     * Filter which LearningProgresses to update
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * Limit how many LearningProgresses to update.
     */
    limit?: number;
};
/**
 * LearningProgress updateManyAndReturn
 */
export type LearningProgressUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * The data used to update LearningProgresses.
     */
    data: Prisma.XOR<Prisma.LearningProgressUpdateManyMutationInput, Prisma.LearningProgressUncheckedUpdateManyInput>;
    /**
     * Filter which LearningProgresses to update
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * Limit how many LearningProgresses to update.
     */
    limit?: number;
};
/**
 * LearningProgress upsert
 */
export type LearningProgressUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * The filter to search for the LearningProgress to update in case it exists.
     */
    where: Prisma.LearningProgressWhereUniqueInput;
    /**
     * In case the LearningProgress found by the `where` argument doesn't exist, create a new LearningProgress with this data.
     */
    create: Prisma.XOR<Prisma.LearningProgressCreateInput, Prisma.LearningProgressUncheckedCreateInput>;
    /**
     * In case the LearningProgress was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.LearningProgressUpdateInput, Prisma.LearningProgressUncheckedUpdateInput>;
};
/**
 * LearningProgress delete
 */
export type LearningProgressDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
    /**
     * Filter which LearningProgress to delete.
     */
    where: Prisma.LearningProgressWhereUniqueInput;
};
/**
 * LearningProgress deleteMany
 */
export type LearningProgressDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which LearningProgresses to delete
     */
    where?: Prisma.LearningProgressWhereInput;
    /**
     * Limit how many LearningProgresses to delete.
     */
    limit?: number;
};
/**
 * LearningProgress without action
 */
export type LearningProgressDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LearningProgress
     */
    select?: Prisma.LearningProgressSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the LearningProgress
     */
    omit?: Prisma.LearningProgressOmit<ExtArgs> | null;
};
export {};
//# sourceMappingURL=LearningProgress.d.ts.map