import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model Enrollment
 *
 */
export type EnrollmentModel = runtime.Types.Result.DefaultSelection<Prisma.$EnrollmentPayload>;
export type AggregateEnrollment = {
    _count: EnrollmentCountAggregateOutputType | null;
    _min: EnrollmentMinAggregateOutputType | null;
    _max: EnrollmentMaxAggregateOutputType | null;
};
export type EnrollmentMinAggregateOutputType = {
    id: string | null;
    studentId: string | null;
    courseId: string | null;
    enrolledAt: Date | null;
    status: string | null;
};
export type EnrollmentMaxAggregateOutputType = {
    id: string | null;
    studentId: string | null;
    courseId: string | null;
    enrolledAt: Date | null;
    status: string | null;
};
export type EnrollmentCountAggregateOutputType = {
    id: number;
    studentId: number;
    courseId: number;
    enrolledAt: number;
    status: number;
    _all: number;
};
export type EnrollmentMinAggregateInputType = {
    id?: true;
    studentId?: true;
    courseId?: true;
    enrolledAt?: true;
    status?: true;
};
export type EnrollmentMaxAggregateInputType = {
    id?: true;
    studentId?: true;
    courseId?: true;
    enrolledAt?: true;
    status?: true;
};
export type EnrollmentCountAggregateInputType = {
    id?: true;
    studentId?: true;
    courseId?: true;
    enrolledAt?: true;
    status?: true;
    _all?: true;
};
export type EnrollmentAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Enrollment to aggregate.
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Enrollments to fetch.
     */
    orderBy?: Prisma.EnrollmentOrderByWithRelationInput | Prisma.EnrollmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.EnrollmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Enrollments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Enrollments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Enrollments
    **/
    _count?: true | EnrollmentCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: EnrollmentMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: EnrollmentMaxAggregateInputType;
};
export type GetEnrollmentAggregateType<T extends EnrollmentAggregateArgs> = {
    [P in keyof T & keyof AggregateEnrollment]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateEnrollment[P]> : Prisma.GetScalarType<T[P], AggregateEnrollment[P]>;
};
export type EnrollmentGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.EnrollmentWhereInput;
    orderBy?: Prisma.EnrollmentOrderByWithAggregationInput | Prisma.EnrollmentOrderByWithAggregationInput[];
    by: Prisma.EnrollmentScalarFieldEnum[] | Prisma.EnrollmentScalarFieldEnum;
    having?: Prisma.EnrollmentScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: EnrollmentCountAggregateInputType | true;
    _min?: EnrollmentMinAggregateInputType;
    _max?: EnrollmentMaxAggregateInputType;
};
export type EnrollmentGroupByOutputType = {
    id: string;
    studentId: string;
    courseId: string;
    enrolledAt: Date;
    status: string;
    _count: EnrollmentCountAggregateOutputType | null;
    _min: EnrollmentMinAggregateOutputType | null;
    _max: EnrollmentMaxAggregateOutputType | null;
};
type GetEnrollmentGroupByPayload<T extends EnrollmentGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<EnrollmentGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof EnrollmentGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], EnrollmentGroupByOutputType[P]> : Prisma.GetScalarType<T[P], EnrollmentGroupByOutputType[P]>;
}>>;
export type EnrollmentWhereInput = {
    AND?: Prisma.EnrollmentWhereInput | Prisma.EnrollmentWhereInput[];
    OR?: Prisma.EnrollmentWhereInput[];
    NOT?: Prisma.EnrollmentWhereInput | Prisma.EnrollmentWhereInput[];
    id?: Prisma.StringFilter<"Enrollment"> | string;
    studentId?: Prisma.StringFilter<"Enrollment"> | string;
    courseId?: Prisma.StringFilter<"Enrollment"> | string;
    enrolledAt?: Prisma.DateTimeFilter<"Enrollment"> | Date | string;
    status?: Prisma.StringFilter<"Enrollment"> | string;
    student?: Prisma.XOR<Prisma.StudentScalarRelationFilter, Prisma.StudentWhereInput>;
    course?: Prisma.XOR<Prisma.CourseScalarRelationFilter, Prisma.CourseWhereInput>;
};
export type EnrollmentOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    enrolledAt?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    student?: Prisma.StudentOrderByWithRelationInput;
    course?: Prisma.CourseOrderByWithRelationInput;
};
export type EnrollmentWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    studentId_courseId?: Prisma.EnrollmentStudentIdCourseIdCompoundUniqueInput;
    AND?: Prisma.EnrollmentWhereInput | Prisma.EnrollmentWhereInput[];
    OR?: Prisma.EnrollmentWhereInput[];
    NOT?: Prisma.EnrollmentWhereInput | Prisma.EnrollmentWhereInput[];
    studentId?: Prisma.StringFilter<"Enrollment"> | string;
    courseId?: Prisma.StringFilter<"Enrollment"> | string;
    enrolledAt?: Prisma.DateTimeFilter<"Enrollment"> | Date | string;
    status?: Prisma.StringFilter<"Enrollment"> | string;
    student?: Prisma.XOR<Prisma.StudentScalarRelationFilter, Prisma.StudentWhereInput>;
    course?: Prisma.XOR<Prisma.CourseScalarRelationFilter, Prisma.CourseWhereInput>;
}, "id" | "studentId_courseId">;
export type EnrollmentOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    enrolledAt?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    _count?: Prisma.EnrollmentCountOrderByAggregateInput;
    _max?: Prisma.EnrollmentMaxOrderByAggregateInput;
    _min?: Prisma.EnrollmentMinOrderByAggregateInput;
};
export type EnrollmentScalarWhereWithAggregatesInput = {
    AND?: Prisma.EnrollmentScalarWhereWithAggregatesInput | Prisma.EnrollmentScalarWhereWithAggregatesInput[];
    OR?: Prisma.EnrollmentScalarWhereWithAggregatesInput[];
    NOT?: Prisma.EnrollmentScalarWhereWithAggregatesInput | Prisma.EnrollmentScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Enrollment"> | string;
    studentId?: Prisma.StringWithAggregatesFilter<"Enrollment"> | string;
    courseId?: Prisma.StringWithAggregatesFilter<"Enrollment"> | string;
    enrolledAt?: Prisma.DateTimeWithAggregatesFilter<"Enrollment"> | Date | string;
    status?: Prisma.StringWithAggregatesFilter<"Enrollment"> | string;
};
export type EnrollmentCreateInput = {
    id?: string;
    enrolledAt?: Date | string;
    status?: string;
    student: Prisma.StudentCreateNestedOneWithoutEnrollmentsInput;
    course: Prisma.CourseCreateNestedOneWithoutEnrollmentsInput;
};
export type EnrollmentUncheckedCreateInput = {
    id?: string;
    studentId: string;
    courseId: string;
    enrolledAt?: Date | string;
    status?: string;
};
export type EnrollmentUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    student?: Prisma.StudentUpdateOneRequiredWithoutEnrollmentsNestedInput;
    course?: Prisma.CourseUpdateOneRequiredWithoutEnrollmentsNestedInput;
};
export type EnrollmentUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentCreateManyInput = {
    id?: string;
    studentId: string;
    courseId: string;
    enrolledAt?: Date | string;
    status?: string;
};
export type EnrollmentUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentListRelationFilter = {
    every?: Prisma.EnrollmentWhereInput;
    some?: Prisma.EnrollmentWhereInput;
    none?: Prisma.EnrollmentWhereInput;
};
export type EnrollmentOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type EnrollmentStudentIdCourseIdCompoundUniqueInput = {
    studentId: string;
    courseId: string;
};
export type EnrollmentCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    enrolledAt?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
};
export type EnrollmentMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    enrolledAt?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
};
export type EnrollmentMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    enrolledAt?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
};
export type EnrollmentCreateNestedManyWithoutStudentInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutStudentInput, Prisma.EnrollmentUncheckedCreateWithoutStudentInput> | Prisma.EnrollmentCreateWithoutStudentInput[] | Prisma.EnrollmentUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutStudentInput | Prisma.EnrollmentCreateOrConnectWithoutStudentInput[];
    createMany?: Prisma.EnrollmentCreateManyStudentInputEnvelope;
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
};
export type EnrollmentUncheckedCreateNestedManyWithoutStudentInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutStudentInput, Prisma.EnrollmentUncheckedCreateWithoutStudentInput> | Prisma.EnrollmentCreateWithoutStudentInput[] | Prisma.EnrollmentUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutStudentInput | Prisma.EnrollmentCreateOrConnectWithoutStudentInput[];
    createMany?: Prisma.EnrollmentCreateManyStudentInputEnvelope;
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
};
export type EnrollmentUpdateManyWithoutStudentNestedInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutStudentInput, Prisma.EnrollmentUncheckedCreateWithoutStudentInput> | Prisma.EnrollmentCreateWithoutStudentInput[] | Prisma.EnrollmentUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutStudentInput | Prisma.EnrollmentCreateOrConnectWithoutStudentInput[];
    upsert?: Prisma.EnrollmentUpsertWithWhereUniqueWithoutStudentInput | Prisma.EnrollmentUpsertWithWhereUniqueWithoutStudentInput[];
    createMany?: Prisma.EnrollmentCreateManyStudentInputEnvelope;
    set?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    disconnect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    delete?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    update?: Prisma.EnrollmentUpdateWithWhereUniqueWithoutStudentInput | Prisma.EnrollmentUpdateWithWhereUniqueWithoutStudentInput[];
    updateMany?: Prisma.EnrollmentUpdateManyWithWhereWithoutStudentInput | Prisma.EnrollmentUpdateManyWithWhereWithoutStudentInput[];
    deleteMany?: Prisma.EnrollmentScalarWhereInput | Prisma.EnrollmentScalarWhereInput[];
};
export type EnrollmentUncheckedUpdateManyWithoutStudentNestedInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutStudentInput, Prisma.EnrollmentUncheckedCreateWithoutStudentInput> | Prisma.EnrollmentCreateWithoutStudentInput[] | Prisma.EnrollmentUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutStudentInput | Prisma.EnrollmentCreateOrConnectWithoutStudentInput[];
    upsert?: Prisma.EnrollmentUpsertWithWhereUniqueWithoutStudentInput | Prisma.EnrollmentUpsertWithWhereUniqueWithoutStudentInput[];
    createMany?: Prisma.EnrollmentCreateManyStudentInputEnvelope;
    set?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    disconnect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    delete?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    update?: Prisma.EnrollmentUpdateWithWhereUniqueWithoutStudentInput | Prisma.EnrollmentUpdateWithWhereUniqueWithoutStudentInput[];
    updateMany?: Prisma.EnrollmentUpdateManyWithWhereWithoutStudentInput | Prisma.EnrollmentUpdateManyWithWhereWithoutStudentInput[];
    deleteMany?: Prisma.EnrollmentScalarWhereInput | Prisma.EnrollmentScalarWhereInput[];
};
export type EnrollmentCreateNestedManyWithoutCourseInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutCourseInput, Prisma.EnrollmentUncheckedCreateWithoutCourseInput> | Prisma.EnrollmentCreateWithoutCourseInput[] | Prisma.EnrollmentUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutCourseInput | Prisma.EnrollmentCreateOrConnectWithoutCourseInput[];
    createMany?: Prisma.EnrollmentCreateManyCourseInputEnvelope;
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
};
export type EnrollmentUncheckedCreateNestedManyWithoutCourseInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutCourseInput, Prisma.EnrollmentUncheckedCreateWithoutCourseInput> | Prisma.EnrollmentCreateWithoutCourseInput[] | Prisma.EnrollmentUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutCourseInput | Prisma.EnrollmentCreateOrConnectWithoutCourseInput[];
    createMany?: Prisma.EnrollmentCreateManyCourseInputEnvelope;
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
};
export type EnrollmentUpdateManyWithoutCourseNestedInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutCourseInput, Prisma.EnrollmentUncheckedCreateWithoutCourseInput> | Prisma.EnrollmentCreateWithoutCourseInput[] | Prisma.EnrollmentUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutCourseInput | Prisma.EnrollmentCreateOrConnectWithoutCourseInput[];
    upsert?: Prisma.EnrollmentUpsertWithWhereUniqueWithoutCourseInput | Prisma.EnrollmentUpsertWithWhereUniqueWithoutCourseInput[];
    createMany?: Prisma.EnrollmentCreateManyCourseInputEnvelope;
    set?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    disconnect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    delete?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    update?: Prisma.EnrollmentUpdateWithWhereUniqueWithoutCourseInput | Prisma.EnrollmentUpdateWithWhereUniqueWithoutCourseInput[];
    updateMany?: Prisma.EnrollmentUpdateManyWithWhereWithoutCourseInput | Prisma.EnrollmentUpdateManyWithWhereWithoutCourseInput[];
    deleteMany?: Prisma.EnrollmentScalarWhereInput | Prisma.EnrollmentScalarWhereInput[];
};
export type EnrollmentUncheckedUpdateManyWithoutCourseNestedInput = {
    create?: Prisma.XOR<Prisma.EnrollmentCreateWithoutCourseInput, Prisma.EnrollmentUncheckedCreateWithoutCourseInput> | Prisma.EnrollmentCreateWithoutCourseInput[] | Prisma.EnrollmentUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.EnrollmentCreateOrConnectWithoutCourseInput | Prisma.EnrollmentCreateOrConnectWithoutCourseInput[];
    upsert?: Prisma.EnrollmentUpsertWithWhereUniqueWithoutCourseInput | Prisma.EnrollmentUpsertWithWhereUniqueWithoutCourseInput[];
    createMany?: Prisma.EnrollmentCreateManyCourseInputEnvelope;
    set?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    disconnect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    delete?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    connect?: Prisma.EnrollmentWhereUniqueInput | Prisma.EnrollmentWhereUniqueInput[];
    update?: Prisma.EnrollmentUpdateWithWhereUniqueWithoutCourseInput | Prisma.EnrollmentUpdateWithWhereUniqueWithoutCourseInput[];
    updateMany?: Prisma.EnrollmentUpdateManyWithWhereWithoutCourseInput | Prisma.EnrollmentUpdateManyWithWhereWithoutCourseInput[];
    deleteMany?: Prisma.EnrollmentScalarWhereInput | Prisma.EnrollmentScalarWhereInput[];
};
export type EnrollmentCreateWithoutStudentInput = {
    id?: string;
    enrolledAt?: Date | string;
    status?: string;
    course: Prisma.CourseCreateNestedOneWithoutEnrollmentsInput;
};
export type EnrollmentUncheckedCreateWithoutStudentInput = {
    id?: string;
    courseId: string;
    enrolledAt?: Date | string;
    status?: string;
};
export type EnrollmentCreateOrConnectWithoutStudentInput = {
    where: Prisma.EnrollmentWhereUniqueInput;
    create: Prisma.XOR<Prisma.EnrollmentCreateWithoutStudentInput, Prisma.EnrollmentUncheckedCreateWithoutStudentInput>;
};
export type EnrollmentCreateManyStudentInputEnvelope = {
    data: Prisma.EnrollmentCreateManyStudentInput | Prisma.EnrollmentCreateManyStudentInput[];
    skipDuplicates?: boolean;
};
export type EnrollmentUpsertWithWhereUniqueWithoutStudentInput = {
    where: Prisma.EnrollmentWhereUniqueInput;
    update: Prisma.XOR<Prisma.EnrollmentUpdateWithoutStudentInput, Prisma.EnrollmentUncheckedUpdateWithoutStudentInput>;
    create: Prisma.XOR<Prisma.EnrollmentCreateWithoutStudentInput, Prisma.EnrollmentUncheckedCreateWithoutStudentInput>;
};
export type EnrollmentUpdateWithWhereUniqueWithoutStudentInput = {
    where: Prisma.EnrollmentWhereUniqueInput;
    data: Prisma.XOR<Prisma.EnrollmentUpdateWithoutStudentInput, Prisma.EnrollmentUncheckedUpdateWithoutStudentInput>;
};
export type EnrollmentUpdateManyWithWhereWithoutStudentInput = {
    where: Prisma.EnrollmentScalarWhereInput;
    data: Prisma.XOR<Prisma.EnrollmentUpdateManyMutationInput, Prisma.EnrollmentUncheckedUpdateManyWithoutStudentInput>;
};
export type EnrollmentScalarWhereInput = {
    AND?: Prisma.EnrollmentScalarWhereInput | Prisma.EnrollmentScalarWhereInput[];
    OR?: Prisma.EnrollmentScalarWhereInput[];
    NOT?: Prisma.EnrollmentScalarWhereInput | Prisma.EnrollmentScalarWhereInput[];
    id?: Prisma.StringFilter<"Enrollment"> | string;
    studentId?: Prisma.StringFilter<"Enrollment"> | string;
    courseId?: Prisma.StringFilter<"Enrollment"> | string;
    enrolledAt?: Prisma.DateTimeFilter<"Enrollment"> | Date | string;
    status?: Prisma.StringFilter<"Enrollment"> | string;
};
export type EnrollmentCreateWithoutCourseInput = {
    id?: string;
    enrolledAt?: Date | string;
    status?: string;
    student: Prisma.StudentCreateNestedOneWithoutEnrollmentsInput;
};
export type EnrollmentUncheckedCreateWithoutCourseInput = {
    id?: string;
    studentId: string;
    enrolledAt?: Date | string;
    status?: string;
};
export type EnrollmentCreateOrConnectWithoutCourseInput = {
    where: Prisma.EnrollmentWhereUniqueInput;
    create: Prisma.XOR<Prisma.EnrollmentCreateWithoutCourseInput, Prisma.EnrollmentUncheckedCreateWithoutCourseInput>;
};
export type EnrollmentCreateManyCourseInputEnvelope = {
    data: Prisma.EnrollmentCreateManyCourseInput | Prisma.EnrollmentCreateManyCourseInput[];
    skipDuplicates?: boolean;
};
export type EnrollmentUpsertWithWhereUniqueWithoutCourseInput = {
    where: Prisma.EnrollmentWhereUniqueInput;
    update: Prisma.XOR<Prisma.EnrollmentUpdateWithoutCourseInput, Prisma.EnrollmentUncheckedUpdateWithoutCourseInput>;
    create: Prisma.XOR<Prisma.EnrollmentCreateWithoutCourseInput, Prisma.EnrollmentUncheckedCreateWithoutCourseInput>;
};
export type EnrollmentUpdateWithWhereUniqueWithoutCourseInput = {
    where: Prisma.EnrollmentWhereUniqueInput;
    data: Prisma.XOR<Prisma.EnrollmentUpdateWithoutCourseInput, Prisma.EnrollmentUncheckedUpdateWithoutCourseInput>;
};
export type EnrollmentUpdateManyWithWhereWithoutCourseInput = {
    where: Prisma.EnrollmentScalarWhereInput;
    data: Prisma.XOR<Prisma.EnrollmentUpdateManyMutationInput, Prisma.EnrollmentUncheckedUpdateManyWithoutCourseInput>;
};
export type EnrollmentCreateManyStudentInput = {
    id?: string;
    courseId: string;
    enrolledAt?: Date | string;
    status?: string;
};
export type EnrollmentUpdateWithoutStudentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    course?: Prisma.CourseUpdateOneRequiredWithoutEnrollmentsNestedInput;
};
export type EnrollmentUncheckedUpdateWithoutStudentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentUncheckedUpdateManyWithoutStudentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentCreateManyCourseInput = {
    id?: string;
    studentId: string;
    enrolledAt?: Date | string;
    status?: string;
};
export type EnrollmentUpdateWithoutCourseInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    student?: Prisma.StudentUpdateOneRequiredWithoutEnrollmentsNestedInput;
};
export type EnrollmentUncheckedUpdateWithoutCourseInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentUncheckedUpdateManyWithoutCourseInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    enrolledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type EnrollmentSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    enrolledAt?: boolean;
    status?: boolean;
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["enrollment"]>;
export type EnrollmentSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    enrolledAt?: boolean;
    status?: boolean;
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["enrollment"]>;
export type EnrollmentSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    enrolledAt?: boolean;
    status?: boolean;
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["enrollment"]>;
export type EnrollmentSelectScalar = {
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    enrolledAt?: boolean;
    status?: boolean;
};
export type EnrollmentOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "studentId" | "courseId" | "enrolledAt" | "status", ExtArgs["result"]["enrollment"]>;
export type EnrollmentInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
};
export type EnrollmentIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
};
export type EnrollmentIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
};
export type $EnrollmentPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Enrollment";
    objects: {
        student: Prisma.$StudentPayload<ExtArgs>;
        course: Prisma.$CoursePayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        studentId: string;
        courseId: string;
        enrolledAt: Date;
        status: string;
    }, ExtArgs["result"]["enrollment"]>;
    composites: {};
};
export type EnrollmentGetPayload<S extends boolean | null | undefined | EnrollmentDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload, S>;
export type EnrollmentCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<EnrollmentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: EnrollmentCountAggregateInputType | true;
};
export interface EnrollmentDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Enrollment'];
        meta: {
            name: 'Enrollment';
        };
    };
    /**
     * Find zero or one Enrollment that matches the filter.
     * @param {EnrollmentFindUniqueArgs} args - Arguments to find a Enrollment
     * @example
     * // Get one Enrollment
     * const enrollment = await prisma.enrollment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EnrollmentFindUniqueArgs>(args: Prisma.SelectSubset<T, EnrollmentFindUniqueArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Enrollment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EnrollmentFindUniqueOrThrowArgs} args - Arguments to find a Enrollment
     * @example
     * // Get one Enrollment
     * const enrollment = await prisma.enrollment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EnrollmentFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, EnrollmentFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Enrollment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentFindFirstArgs} args - Arguments to find a Enrollment
     * @example
     * // Get one Enrollment
     * const enrollment = await prisma.enrollment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EnrollmentFindFirstArgs>(args?: Prisma.SelectSubset<T, EnrollmentFindFirstArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Enrollment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentFindFirstOrThrowArgs} args - Arguments to find a Enrollment
     * @example
     * // Get one Enrollment
     * const enrollment = await prisma.enrollment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EnrollmentFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, EnrollmentFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Enrollments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Enrollments
     * const enrollments = await prisma.enrollment.findMany()
     *
     * // Get first 10 Enrollments
     * const enrollments = await prisma.enrollment.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const enrollmentWithIdOnly = await prisma.enrollment.findMany({ select: { id: true } })
     *
     */
    findMany<T extends EnrollmentFindManyArgs>(args?: Prisma.SelectSubset<T, EnrollmentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Enrollment.
     * @param {EnrollmentCreateArgs} args - Arguments to create a Enrollment.
     * @example
     * // Create one Enrollment
     * const Enrollment = await prisma.enrollment.create({
     *   data: {
     *     // ... data to create a Enrollment
     *   }
     * })
     *
     */
    create<T extends EnrollmentCreateArgs>(args: Prisma.SelectSubset<T, EnrollmentCreateArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Enrollments.
     * @param {EnrollmentCreateManyArgs} args - Arguments to create many Enrollments.
     * @example
     * // Create many Enrollments
     * const enrollment = await prisma.enrollment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends EnrollmentCreateManyArgs>(args?: Prisma.SelectSubset<T, EnrollmentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Enrollments and returns the data saved in the database.
     * @param {EnrollmentCreateManyAndReturnArgs} args - Arguments to create many Enrollments.
     * @example
     * // Create many Enrollments
     * const enrollment = await prisma.enrollment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Enrollments and only return the `id`
     * const enrollmentWithIdOnly = await prisma.enrollment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends EnrollmentCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, EnrollmentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Enrollment.
     * @param {EnrollmentDeleteArgs} args - Arguments to delete one Enrollment.
     * @example
     * // Delete one Enrollment
     * const Enrollment = await prisma.enrollment.delete({
     *   where: {
     *     // ... filter to delete one Enrollment
     *   }
     * })
     *
     */
    delete<T extends EnrollmentDeleteArgs>(args: Prisma.SelectSubset<T, EnrollmentDeleteArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Enrollment.
     * @param {EnrollmentUpdateArgs} args - Arguments to update one Enrollment.
     * @example
     * // Update one Enrollment
     * const enrollment = await prisma.enrollment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends EnrollmentUpdateArgs>(args: Prisma.SelectSubset<T, EnrollmentUpdateArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Enrollments.
     * @param {EnrollmentDeleteManyArgs} args - Arguments to filter Enrollments to delete.
     * @example
     * // Delete a few Enrollments
     * const { count } = await prisma.enrollment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends EnrollmentDeleteManyArgs>(args?: Prisma.SelectSubset<T, EnrollmentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Enrollments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Enrollments
     * const enrollment = await prisma.enrollment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends EnrollmentUpdateManyArgs>(args: Prisma.SelectSubset<T, EnrollmentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Enrollments and returns the data updated in the database.
     * @param {EnrollmentUpdateManyAndReturnArgs} args - Arguments to update many Enrollments.
     * @example
     * // Update many Enrollments
     * const enrollment = await prisma.enrollment.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Enrollments and only return the `id`
     * const enrollmentWithIdOnly = await prisma.enrollment.updateManyAndReturn({
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
    updateManyAndReturn<T extends EnrollmentUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, EnrollmentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Enrollment.
     * @param {EnrollmentUpsertArgs} args - Arguments to update or create a Enrollment.
     * @example
     * // Update or create a Enrollment
     * const enrollment = await prisma.enrollment.upsert({
     *   create: {
     *     // ... data to create a Enrollment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Enrollment we want to update
     *   }
     * })
     */
    upsert<T extends EnrollmentUpsertArgs>(args: Prisma.SelectSubset<T, EnrollmentUpsertArgs<ExtArgs>>): Prisma.Prisma__EnrollmentClient<runtime.Types.Result.GetResult<Prisma.$EnrollmentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Enrollments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentCountArgs} args - Arguments to filter Enrollments to count.
     * @example
     * // Count the number of Enrollments
     * const count = await prisma.enrollment.count({
     *   where: {
     *     // ... the filter for the Enrollments we want to count
     *   }
     * })
    **/
    count<T extends EnrollmentCountArgs>(args?: Prisma.Subset<T, EnrollmentCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], EnrollmentCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Enrollment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends EnrollmentAggregateArgs>(args: Prisma.Subset<T, EnrollmentAggregateArgs>): Prisma.PrismaPromise<GetEnrollmentAggregateType<T>>;
    /**
     * Group by Enrollment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EnrollmentGroupByArgs} args - Group by arguments.
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
    groupBy<T extends EnrollmentGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: EnrollmentGroupByArgs['orderBy'];
    } : {
        orderBy?: EnrollmentGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, EnrollmentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEnrollmentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Enrollment model
     */
    readonly fields: EnrollmentFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Enrollment.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__EnrollmentClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    student<T extends Prisma.StudentDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.StudentDefaultArgs<ExtArgs>>): Prisma.Prisma__StudentClient<runtime.Types.Result.GetResult<Prisma.$StudentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    course<T extends Prisma.CourseDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.CourseDefaultArgs<ExtArgs>>): Prisma.Prisma__CourseClient<runtime.Types.Result.GetResult<Prisma.$CoursePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the Enrollment model
 */
export interface EnrollmentFieldRefs {
    readonly id: Prisma.FieldRef<"Enrollment", 'String'>;
    readonly studentId: Prisma.FieldRef<"Enrollment", 'String'>;
    readonly courseId: Prisma.FieldRef<"Enrollment", 'String'>;
    readonly enrolledAt: Prisma.FieldRef<"Enrollment", 'DateTime'>;
    readonly status: Prisma.FieldRef<"Enrollment", 'String'>;
}
/**
 * Enrollment findUnique
 */
export type EnrollmentFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * Filter, which Enrollment to fetch.
     */
    where: Prisma.EnrollmentWhereUniqueInput;
};
/**
 * Enrollment findUniqueOrThrow
 */
export type EnrollmentFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * Filter, which Enrollment to fetch.
     */
    where: Prisma.EnrollmentWhereUniqueInput;
};
/**
 * Enrollment findFirst
 */
export type EnrollmentFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * Filter, which Enrollment to fetch.
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Enrollments to fetch.
     */
    orderBy?: Prisma.EnrollmentOrderByWithRelationInput | Prisma.EnrollmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Enrollments.
     */
    cursor?: Prisma.EnrollmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Enrollments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Enrollments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Enrollments.
     */
    distinct?: Prisma.EnrollmentScalarFieldEnum | Prisma.EnrollmentScalarFieldEnum[];
};
/**
 * Enrollment findFirstOrThrow
 */
export type EnrollmentFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * Filter, which Enrollment to fetch.
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Enrollments to fetch.
     */
    orderBy?: Prisma.EnrollmentOrderByWithRelationInput | Prisma.EnrollmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Enrollments.
     */
    cursor?: Prisma.EnrollmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Enrollments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Enrollments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Enrollments.
     */
    distinct?: Prisma.EnrollmentScalarFieldEnum | Prisma.EnrollmentScalarFieldEnum[];
};
/**
 * Enrollment findMany
 */
export type EnrollmentFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * Filter, which Enrollments to fetch.
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Enrollments to fetch.
     */
    orderBy?: Prisma.EnrollmentOrderByWithRelationInput | Prisma.EnrollmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Enrollments.
     */
    cursor?: Prisma.EnrollmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Enrollments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Enrollments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Enrollments.
     */
    distinct?: Prisma.EnrollmentScalarFieldEnum | Prisma.EnrollmentScalarFieldEnum[];
};
/**
 * Enrollment create
 */
export type EnrollmentCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * The data needed to create a Enrollment.
     */
    data: Prisma.XOR<Prisma.EnrollmentCreateInput, Prisma.EnrollmentUncheckedCreateInput>;
};
/**
 * Enrollment createMany
 */
export type EnrollmentCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Enrollments.
     */
    data: Prisma.EnrollmentCreateManyInput | Prisma.EnrollmentCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Enrollment createManyAndReturn
 */
export type EnrollmentCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * The data used to create many Enrollments.
     */
    data: Prisma.EnrollmentCreateManyInput | Prisma.EnrollmentCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Enrollment update
 */
export type EnrollmentUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * The data needed to update a Enrollment.
     */
    data: Prisma.XOR<Prisma.EnrollmentUpdateInput, Prisma.EnrollmentUncheckedUpdateInput>;
    /**
     * Choose, which Enrollment to update.
     */
    where: Prisma.EnrollmentWhereUniqueInput;
};
/**
 * Enrollment updateMany
 */
export type EnrollmentUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Enrollments.
     */
    data: Prisma.XOR<Prisma.EnrollmentUpdateManyMutationInput, Prisma.EnrollmentUncheckedUpdateManyInput>;
    /**
     * Filter which Enrollments to update
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * Limit how many Enrollments to update.
     */
    limit?: number;
};
/**
 * Enrollment updateManyAndReturn
 */
export type EnrollmentUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * The data used to update Enrollments.
     */
    data: Prisma.XOR<Prisma.EnrollmentUpdateManyMutationInput, Prisma.EnrollmentUncheckedUpdateManyInput>;
    /**
     * Filter which Enrollments to update
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * Limit how many Enrollments to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Enrollment upsert
 */
export type EnrollmentUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * The filter to search for the Enrollment to update in case it exists.
     */
    where: Prisma.EnrollmentWhereUniqueInput;
    /**
     * In case the Enrollment found by the `where` argument doesn't exist, create a new Enrollment with this data.
     */
    create: Prisma.XOR<Prisma.EnrollmentCreateInput, Prisma.EnrollmentUncheckedCreateInput>;
    /**
     * In case the Enrollment was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.EnrollmentUpdateInput, Prisma.EnrollmentUncheckedUpdateInput>;
};
/**
 * Enrollment delete
 */
export type EnrollmentDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
    /**
     * Filter which Enrollment to delete.
     */
    where: Prisma.EnrollmentWhereUniqueInput;
};
/**
 * Enrollment deleteMany
 */
export type EnrollmentDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Enrollments to delete
     */
    where?: Prisma.EnrollmentWhereInput;
    /**
     * Limit how many Enrollments to delete.
     */
    limit?: number;
};
/**
 * Enrollment without action
 */
export type EnrollmentDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Enrollment
     */
    select?: Prisma.EnrollmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Enrollment
     */
    omit?: Prisma.EnrollmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.EnrollmentInclude<ExtArgs> | null;
};
export {};
//# sourceMappingURL=Enrollment.d.ts.map