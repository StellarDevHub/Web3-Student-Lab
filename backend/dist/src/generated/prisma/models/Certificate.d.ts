import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model Certificate
 *
 */
export type CertificateModel = runtime.Types.Result.DefaultSelection<Prisma.$CertificatePayload>;
export type AggregateCertificate = {
    _count: CertificateCountAggregateOutputType | null;
    _min: CertificateMinAggregateOutputType | null;
    _max: CertificateMaxAggregateOutputType | null;
};
export type CertificateMinAggregateOutputType = {
    id: string | null;
    studentId: string | null;
    courseId: string | null;
    issuedAt: Date | null;
    certificateHash: string | null;
    status: string | null;
};
export type CertificateMaxAggregateOutputType = {
    id: string | null;
    studentId: string | null;
    courseId: string | null;
    issuedAt: Date | null;
    certificateHash: string | null;
    status: string | null;
};
export type CertificateCountAggregateOutputType = {
    id: number;
    studentId: number;
    courseId: number;
    issuedAt: number;
    certificateHash: number;
    status: number;
    _all: number;
};
export type CertificateMinAggregateInputType = {
    id?: true;
    studentId?: true;
    courseId?: true;
    issuedAt?: true;
    certificateHash?: true;
    status?: true;
};
export type CertificateMaxAggregateInputType = {
    id?: true;
    studentId?: true;
    courseId?: true;
    issuedAt?: true;
    certificateHash?: true;
    status?: true;
};
export type CertificateCountAggregateInputType = {
    id?: true;
    studentId?: true;
    courseId?: true;
    issuedAt?: true;
    certificateHash?: true;
    status?: true;
    _all?: true;
};
export type CertificateAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Certificate to aggregate.
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Certificates to fetch.
     */
    orderBy?: Prisma.CertificateOrderByWithRelationInput | Prisma.CertificateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.CertificateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Certificates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Certificates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Certificates
    **/
    _count?: true | CertificateCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: CertificateMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: CertificateMaxAggregateInputType;
};
export type GetCertificateAggregateType<T extends CertificateAggregateArgs> = {
    [P in keyof T & keyof AggregateCertificate]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateCertificate[P]> : Prisma.GetScalarType<T[P], AggregateCertificate[P]>;
};
export type CertificateGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.CertificateWhereInput;
    orderBy?: Prisma.CertificateOrderByWithAggregationInput | Prisma.CertificateOrderByWithAggregationInput[];
    by: Prisma.CertificateScalarFieldEnum[] | Prisma.CertificateScalarFieldEnum;
    having?: Prisma.CertificateScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: CertificateCountAggregateInputType | true;
    _min?: CertificateMinAggregateInputType;
    _max?: CertificateMaxAggregateInputType;
};
export type CertificateGroupByOutputType = {
    id: string;
    studentId: string;
    courseId: string;
    issuedAt: Date;
    certificateHash: string | null;
    status: string;
    _count: CertificateCountAggregateOutputType | null;
    _min: CertificateMinAggregateOutputType | null;
    _max: CertificateMaxAggregateOutputType | null;
};
type GetCertificateGroupByPayload<T extends CertificateGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<CertificateGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof CertificateGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], CertificateGroupByOutputType[P]> : Prisma.GetScalarType<T[P], CertificateGroupByOutputType[P]>;
}>>;
export type CertificateWhereInput = {
    AND?: Prisma.CertificateWhereInput | Prisma.CertificateWhereInput[];
    OR?: Prisma.CertificateWhereInput[];
    NOT?: Prisma.CertificateWhereInput | Prisma.CertificateWhereInput[];
    id?: Prisma.StringFilter<"Certificate"> | string;
    studentId?: Prisma.StringFilter<"Certificate"> | string;
    courseId?: Prisma.StringFilter<"Certificate"> | string;
    issuedAt?: Prisma.DateTimeFilter<"Certificate"> | Date | string;
    certificateHash?: Prisma.StringNullableFilter<"Certificate"> | string | null;
    status?: Prisma.StringFilter<"Certificate"> | string;
    student?: Prisma.XOR<Prisma.StudentScalarRelationFilter, Prisma.StudentWhereInput>;
    course?: Prisma.XOR<Prisma.CourseScalarRelationFilter, Prisma.CourseWhereInput>;
};
export type CertificateOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    issuedAt?: Prisma.SortOrder;
    certificateHash?: Prisma.SortOrderInput | Prisma.SortOrder;
    status?: Prisma.SortOrder;
    student?: Prisma.StudentOrderByWithRelationInput;
    course?: Prisma.CourseOrderByWithRelationInput;
};
export type CertificateWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.CertificateWhereInput | Prisma.CertificateWhereInput[];
    OR?: Prisma.CertificateWhereInput[];
    NOT?: Prisma.CertificateWhereInput | Prisma.CertificateWhereInput[];
    studentId?: Prisma.StringFilter<"Certificate"> | string;
    courseId?: Prisma.StringFilter<"Certificate"> | string;
    issuedAt?: Prisma.DateTimeFilter<"Certificate"> | Date | string;
    certificateHash?: Prisma.StringNullableFilter<"Certificate"> | string | null;
    status?: Prisma.StringFilter<"Certificate"> | string;
    student?: Prisma.XOR<Prisma.StudentScalarRelationFilter, Prisma.StudentWhereInput>;
    course?: Prisma.XOR<Prisma.CourseScalarRelationFilter, Prisma.CourseWhereInput>;
}, "id">;
export type CertificateOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    issuedAt?: Prisma.SortOrder;
    certificateHash?: Prisma.SortOrderInput | Prisma.SortOrder;
    status?: Prisma.SortOrder;
    _count?: Prisma.CertificateCountOrderByAggregateInput;
    _max?: Prisma.CertificateMaxOrderByAggregateInput;
    _min?: Prisma.CertificateMinOrderByAggregateInput;
};
export type CertificateScalarWhereWithAggregatesInput = {
    AND?: Prisma.CertificateScalarWhereWithAggregatesInput | Prisma.CertificateScalarWhereWithAggregatesInput[];
    OR?: Prisma.CertificateScalarWhereWithAggregatesInput[];
    NOT?: Prisma.CertificateScalarWhereWithAggregatesInput | Prisma.CertificateScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Certificate"> | string;
    studentId?: Prisma.StringWithAggregatesFilter<"Certificate"> | string;
    courseId?: Prisma.StringWithAggregatesFilter<"Certificate"> | string;
    issuedAt?: Prisma.DateTimeWithAggregatesFilter<"Certificate"> | Date | string;
    certificateHash?: Prisma.StringNullableWithAggregatesFilter<"Certificate"> | string | null;
    status?: Prisma.StringWithAggregatesFilter<"Certificate"> | string;
};
export type CertificateCreateInput = {
    id?: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
    student: Prisma.StudentCreateNestedOneWithoutCertificatesInput;
    course: Prisma.CourseCreateNestedOneWithoutCertificatesInput;
};
export type CertificateUncheckedCreateInput = {
    id?: string;
    studentId: string;
    courseId: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
};
export type CertificateUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    student?: Prisma.StudentUpdateOneRequiredWithoutCertificatesNestedInput;
    course?: Prisma.CourseUpdateOneRequiredWithoutCertificatesNestedInput;
};
export type CertificateUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateCreateManyInput = {
    id?: string;
    studentId: string;
    courseId: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
};
export type CertificateUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateListRelationFilter = {
    every?: Prisma.CertificateWhereInput;
    some?: Prisma.CertificateWhereInput;
    none?: Prisma.CertificateWhereInput;
};
export type CertificateOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type CertificateCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    issuedAt?: Prisma.SortOrder;
    certificateHash?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
};
export type CertificateMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    issuedAt?: Prisma.SortOrder;
    certificateHash?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
};
export type CertificateMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    studentId?: Prisma.SortOrder;
    courseId?: Prisma.SortOrder;
    issuedAt?: Prisma.SortOrder;
    certificateHash?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
};
export type CertificateCreateNestedManyWithoutStudentInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutStudentInput, Prisma.CertificateUncheckedCreateWithoutStudentInput> | Prisma.CertificateCreateWithoutStudentInput[] | Prisma.CertificateUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutStudentInput | Prisma.CertificateCreateOrConnectWithoutStudentInput[];
    createMany?: Prisma.CertificateCreateManyStudentInputEnvelope;
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
};
export type CertificateUncheckedCreateNestedManyWithoutStudentInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutStudentInput, Prisma.CertificateUncheckedCreateWithoutStudentInput> | Prisma.CertificateCreateWithoutStudentInput[] | Prisma.CertificateUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutStudentInput | Prisma.CertificateCreateOrConnectWithoutStudentInput[];
    createMany?: Prisma.CertificateCreateManyStudentInputEnvelope;
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
};
export type CertificateUpdateManyWithoutStudentNestedInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutStudentInput, Prisma.CertificateUncheckedCreateWithoutStudentInput> | Prisma.CertificateCreateWithoutStudentInput[] | Prisma.CertificateUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutStudentInput | Prisma.CertificateCreateOrConnectWithoutStudentInput[];
    upsert?: Prisma.CertificateUpsertWithWhereUniqueWithoutStudentInput | Prisma.CertificateUpsertWithWhereUniqueWithoutStudentInput[];
    createMany?: Prisma.CertificateCreateManyStudentInputEnvelope;
    set?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    disconnect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    delete?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    update?: Prisma.CertificateUpdateWithWhereUniqueWithoutStudentInput | Prisma.CertificateUpdateWithWhereUniqueWithoutStudentInput[];
    updateMany?: Prisma.CertificateUpdateManyWithWhereWithoutStudentInput | Prisma.CertificateUpdateManyWithWhereWithoutStudentInput[];
    deleteMany?: Prisma.CertificateScalarWhereInput | Prisma.CertificateScalarWhereInput[];
};
export type CertificateUncheckedUpdateManyWithoutStudentNestedInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutStudentInput, Prisma.CertificateUncheckedCreateWithoutStudentInput> | Prisma.CertificateCreateWithoutStudentInput[] | Prisma.CertificateUncheckedCreateWithoutStudentInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutStudentInput | Prisma.CertificateCreateOrConnectWithoutStudentInput[];
    upsert?: Prisma.CertificateUpsertWithWhereUniqueWithoutStudentInput | Prisma.CertificateUpsertWithWhereUniqueWithoutStudentInput[];
    createMany?: Prisma.CertificateCreateManyStudentInputEnvelope;
    set?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    disconnect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    delete?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    update?: Prisma.CertificateUpdateWithWhereUniqueWithoutStudentInput | Prisma.CertificateUpdateWithWhereUniqueWithoutStudentInput[];
    updateMany?: Prisma.CertificateUpdateManyWithWhereWithoutStudentInput | Prisma.CertificateUpdateManyWithWhereWithoutStudentInput[];
    deleteMany?: Prisma.CertificateScalarWhereInput | Prisma.CertificateScalarWhereInput[];
};
export type CertificateCreateNestedManyWithoutCourseInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutCourseInput, Prisma.CertificateUncheckedCreateWithoutCourseInput> | Prisma.CertificateCreateWithoutCourseInput[] | Prisma.CertificateUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutCourseInput | Prisma.CertificateCreateOrConnectWithoutCourseInput[];
    createMany?: Prisma.CertificateCreateManyCourseInputEnvelope;
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
};
export type CertificateUncheckedCreateNestedManyWithoutCourseInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutCourseInput, Prisma.CertificateUncheckedCreateWithoutCourseInput> | Prisma.CertificateCreateWithoutCourseInput[] | Prisma.CertificateUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutCourseInput | Prisma.CertificateCreateOrConnectWithoutCourseInput[];
    createMany?: Prisma.CertificateCreateManyCourseInputEnvelope;
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
};
export type CertificateUpdateManyWithoutCourseNestedInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutCourseInput, Prisma.CertificateUncheckedCreateWithoutCourseInput> | Prisma.CertificateCreateWithoutCourseInput[] | Prisma.CertificateUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutCourseInput | Prisma.CertificateCreateOrConnectWithoutCourseInput[];
    upsert?: Prisma.CertificateUpsertWithWhereUniqueWithoutCourseInput | Prisma.CertificateUpsertWithWhereUniqueWithoutCourseInput[];
    createMany?: Prisma.CertificateCreateManyCourseInputEnvelope;
    set?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    disconnect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    delete?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    update?: Prisma.CertificateUpdateWithWhereUniqueWithoutCourseInput | Prisma.CertificateUpdateWithWhereUniqueWithoutCourseInput[];
    updateMany?: Prisma.CertificateUpdateManyWithWhereWithoutCourseInput | Prisma.CertificateUpdateManyWithWhereWithoutCourseInput[];
    deleteMany?: Prisma.CertificateScalarWhereInput | Prisma.CertificateScalarWhereInput[];
};
export type CertificateUncheckedUpdateManyWithoutCourseNestedInput = {
    create?: Prisma.XOR<Prisma.CertificateCreateWithoutCourseInput, Prisma.CertificateUncheckedCreateWithoutCourseInput> | Prisma.CertificateCreateWithoutCourseInput[] | Prisma.CertificateUncheckedCreateWithoutCourseInput[];
    connectOrCreate?: Prisma.CertificateCreateOrConnectWithoutCourseInput | Prisma.CertificateCreateOrConnectWithoutCourseInput[];
    upsert?: Prisma.CertificateUpsertWithWhereUniqueWithoutCourseInput | Prisma.CertificateUpsertWithWhereUniqueWithoutCourseInput[];
    createMany?: Prisma.CertificateCreateManyCourseInputEnvelope;
    set?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    disconnect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    delete?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    connect?: Prisma.CertificateWhereUniqueInput | Prisma.CertificateWhereUniqueInput[];
    update?: Prisma.CertificateUpdateWithWhereUniqueWithoutCourseInput | Prisma.CertificateUpdateWithWhereUniqueWithoutCourseInput[];
    updateMany?: Prisma.CertificateUpdateManyWithWhereWithoutCourseInput | Prisma.CertificateUpdateManyWithWhereWithoutCourseInput[];
    deleteMany?: Prisma.CertificateScalarWhereInput | Prisma.CertificateScalarWhereInput[];
};
export type CertificateCreateWithoutStudentInput = {
    id?: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
    course: Prisma.CourseCreateNestedOneWithoutCertificatesInput;
};
export type CertificateUncheckedCreateWithoutStudentInput = {
    id?: string;
    courseId: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
};
export type CertificateCreateOrConnectWithoutStudentInput = {
    where: Prisma.CertificateWhereUniqueInput;
    create: Prisma.XOR<Prisma.CertificateCreateWithoutStudentInput, Prisma.CertificateUncheckedCreateWithoutStudentInput>;
};
export type CertificateCreateManyStudentInputEnvelope = {
    data: Prisma.CertificateCreateManyStudentInput | Prisma.CertificateCreateManyStudentInput[];
    skipDuplicates?: boolean;
};
export type CertificateUpsertWithWhereUniqueWithoutStudentInput = {
    where: Prisma.CertificateWhereUniqueInput;
    update: Prisma.XOR<Prisma.CertificateUpdateWithoutStudentInput, Prisma.CertificateUncheckedUpdateWithoutStudentInput>;
    create: Prisma.XOR<Prisma.CertificateCreateWithoutStudentInput, Prisma.CertificateUncheckedCreateWithoutStudentInput>;
};
export type CertificateUpdateWithWhereUniqueWithoutStudentInput = {
    where: Prisma.CertificateWhereUniqueInput;
    data: Prisma.XOR<Prisma.CertificateUpdateWithoutStudentInput, Prisma.CertificateUncheckedUpdateWithoutStudentInput>;
};
export type CertificateUpdateManyWithWhereWithoutStudentInput = {
    where: Prisma.CertificateScalarWhereInput;
    data: Prisma.XOR<Prisma.CertificateUpdateManyMutationInput, Prisma.CertificateUncheckedUpdateManyWithoutStudentInput>;
};
export type CertificateScalarWhereInput = {
    AND?: Prisma.CertificateScalarWhereInput | Prisma.CertificateScalarWhereInput[];
    OR?: Prisma.CertificateScalarWhereInput[];
    NOT?: Prisma.CertificateScalarWhereInput | Prisma.CertificateScalarWhereInput[];
    id?: Prisma.StringFilter<"Certificate"> | string;
    studentId?: Prisma.StringFilter<"Certificate"> | string;
    courseId?: Prisma.StringFilter<"Certificate"> | string;
    issuedAt?: Prisma.DateTimeFilter<"Certificate"> | Date | string;
    certificateHash?: Prisma.StringNullableFilter<"Certificate"> | string | null;
    status?: Prisma.StringFilter<"Certificate"> | string;
};
export type CertificateCreateWithoutCourseInput = {
    id?: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
    student: Prisma.StudentCreateNestedOneWithoutCertificatesInput;
};
export type CertificateUncheckedCreateWithoutCourseInput = {
    id?: string;
    studentId: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
};
export type CertificateCreateOrConnectWithoutCourseInput = {
    where: Prisma.CertificateWhereUniqueInput;
    create: Prisma.XOR<Prisma.CertificateCreateWithoutCourseInput, Prisma.CertificateUncheckedCreateWithoutCourseInput>;
};
export type CertificateCreateManyCourseInputEnvelope = {
    data: Prisma.CertificateCreateManyCourseInput | Prisma.CertificateCreateManyCourseInput[];
    skipDuplicates?: boolean;
};
export type CertificateUpsertWithWhereUniqueWithoutCourseInput = {
    where: Prisma.CertificateWhereUniqueInput;
    update: Prisma.XOR<Prisma.CertificateUpdateWithoutCourseInput, Prisma.CertificateUncheckedUpdateWithoutCourseInput>;
    create: Prisma.XOR<Prisma.CertificateCreateWithoutCourseInput, Prisma.CertificateUncheckedCreateWithoutCourseInput>;
};
export type CertificateUpdateWithWhereUniqueWithoutCourseInput = {
    where: Prisma.CertificateWhereUniqueInput;
    data: Prisma.XOR<Prisma.CertificateUpdateWithoutCourseInput, Prisma.CertificateUncheckedUpdateWithoutCourseInput>;
};
export type CertificateUpdateManyWithWhereWithoutCourseInput = {
    where: Prisma.CertificateScalarWhereInput;
    data: Prisma.XOR<Prisma.CertificateUpdateManyMutationInput, Prisma.CertificateUncheckedUpdateManyWithoutCourseInput>;
};
export type CertificateCreateManyStudentInput = {
    id?: string;
    courseId: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
};
export type CertificateUpdateWithoutStudentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    course?: Prisma.CourseUpdateOneRequiredWithoutCertificatesNestedInput;
};
export type CertificateUncheckedUpdateWithoutStudentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateUncheckedUpdateManyWithoutStudentInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    courseId?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateCreateManyCourseInput = {
    id?: string;
    studentId: string;
    issuedAt?: Date | string;
    certificateHash?: string | null;
    status?: string;
};
export type CertificateUpdateWithoutCourseInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    student?: Prisma.StudentUpdateOneRequiredWithoutCertificatesNestedInput;
};
export type CertificateUncheckedUpdateWithoutCourseInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateUncheckedUpdateManyWithoutCourseInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    studentId?: Prisma.StringFieldUpdateOperationsInput | string;
    issuedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    certificateHash?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type CertificateSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    issuedAt?: boolean;
    certificateHash?: boolean;
    status?: boolean;
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["certificate"]>;
export type CertificateSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    issuedAt?: boolean;
    certificateHash?: boolean;
    status?: boolean;
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["certificate"]>;
export type CertificateSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    issuedAt?: boolean;
    certificateHash?: boolean;
    status?: boolean;
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["certificate"]>;
export type CertificateSelectScalar = {
    id?: boolean;
    studentId?: boolean;
    courseId?: boolean;
    issuedAt?: boolean;
    certificateHash?: boolean;
    status?: boolean;
};
export type CertificateOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "studentId" | "courseId" | "issuedAt" | "certificateHash" | "status", ExtArgs["result"]["certificate"]>;
export type CertificateInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
};
export type CertificateIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
};
export type CertificateIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    student?: boolean | Prisma.StudentDefaultArgs<ExtArgs>;
    course?: boolean | Prisma.CourseDefaultArgs<ExtArgs>;
};
export type $CertificatePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Certificate";
    objects: {
        student: Prisma.$StudentPayload<ExtArgs>;
        course: Prisma.$CoursePayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        studentId: string;
        courseId: string;
        issuedAt: Date;
        certificateHash: string | null;
        status: string;
    }, ExtArgs["result"]["certificate"]>;
    composites: {};
};
export type CertificateGetPayload<S extends boolean | null | undefined | CertificateDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$CertificatePayload, S>;
export type CertificateCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<CertificateFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: CertificateCountAggregateInputType | true;
};
export interface CertificateDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Certificate'];
        meta: {
            name: 'Certificate';
        };
    };
    /**
     * Find zero or one Certificate that matches the filter.
     * @param {CertificateFindUniqueArgs} args - Arguments to find a Certificate
     * @example
     * // Get one Certificate
     * const certificate = await prisma.certificate.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CertificateFindUniqueArgs>(args: Prisma.SelectSubset<T, CertificateFindUniqueArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Certificate that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CertificateFindUniqueOrThrowArgs} args - Arguments to find a Certificate
     * @example
     * // Get one Certificate
     * const certificate = await prisma.certificate.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CertificateFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, CertificateFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Certificate that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateFindFirstArgs} args - Arguments to find a Certificate
     * @example
     * // Get one Certificate
     * const certificate = await prisma.certificate.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CertificateFindFirstArgs>(args?: Prisma.SelectSubset<T, CertificateFindFirstArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Certificate that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateFindFirstOrThrowArgs} args - Arguments to find a Certificate
     * @example
     * // Get one Certificate
     * const certificate = await prisma.certificate.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CertificateFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, CertificateFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Certificates that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Certificates
     * const certificates = await prisma.certificate.findMany()
     *
     * // Get first 10 Certificates
     * const certificates = await prisma.certificate.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const certificateWithIdOnly = await prisma.certificate.findMany({ select: { id: true } })
     *
     */
    findMany<T extends CertificateFindManyArgs>(args?: Prisma.SelectSubset<T, CertificateFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Certificate.
     * @param {CertificateCreateArgs} args - Arguments to create a Certificate.
     * @example
     * // Create one Certificate
     * const Certificate = await prisma.certificate.create({
     *   data: {
     *     // ... data to create a Certificate
     *   }
     * })
     *
     */
    create<T extends CertificateCreateArgs>(args: Prisma.SelectSubset<T, CertificateCreateArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Certificates.
     * @param {CertificateCreateManyArgs} args - Arguments to create many Certificates.
     * @example
     * // Create many Certificates
     * const certificate = await prisma.certificate.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends CertificateCreateManyArgs>(args?: Prisma.SelectSubset<T, CertificateCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Certificates and returns the data saved in the database.
     * @param {CertificateCreateManyAndReturnArgs} args - Arguments to create many Certificates.
     * @example
     * // Create many Certificates
     * const certificate = await prisma.certificate.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Certificates and only return the `id`
     * const certificateWithIdOnly = await prisma.certificate.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends CertificateCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, CertificateCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Certificate.
     * @param {CertificateDeleteArgs} args - Arguments to delete one Certificate.
     * @example
     * // Delete one Certificate
     * const Certificate = await prisma.certificate.delete({
     *   where: {
     *     // ... filter to delete one Certificate
     *   }
     * })
     *
     */
    delete<T extends CertificateDeleteArgs>(args: Prisma.SelectSubset<T, CertificateDeleteArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Certificate.
     * @param {CertificateUpdateArgs} args - Arguments to update one Certificate.
     * @example
     * // Update one Certificate
     * const certificate = await prisma.certificate.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends CertificateUpdateArgs>(args: Prisma.SelectSubset<T, CertificateUpdateArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Certificates.
     * @param {CertificateDeleteManyArgs} args - Arguments to filter Certificates to delete.
     * @example
     * // Delete a few Certificates
     * const { count } = await prisma.certificate.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends CertificateDeleteManyArgs>(args?: Prisma.SelectSubset<T, CertificateDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Certificates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Certificates
     * const certificate = await prisma.certificate.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends CertificateUpdateManyArgs>(args: Prisma.SelectSubset<T, CertificateUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Certificates and returns the data updated in the database.
     * @param {CertificateUpdateManyAndReturnArgs} args - Arguments to update many Certificates.
     * @example
     * // Update many Certificates
     * const certificate = await prisma.certificate.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Certificates and only return the `id`
     * const certificateWithIdOnly = await prisma.certificate.updateManyAndReturn({
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
    updateManyAndReturn<T extends CertificateUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, CertificateUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Certificate.
     * @param {CertificateUpsertArgs} args - Arguments to update or create a Certificate.
     * @example
     * // Update or create a Certificate
     * const certificate = await prisma.certificate.upsert({
     *   create: {
     *     // ... data to create a Certificate
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Certificate we want to update
     *   }
     * })
     */
    upsert<T extends CertificateUpsertArgs>(args: Prisma.SelectSubset<T, CertificateUpsertArgs<ExtArgs>>): Prisma.Prisma__CertificateClient<runtime.Types.Result.GetResult<Prisma.$CertificatePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Certificates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateCountArgs} args - Arguments to filter Certificates to count.
     * @example
     * // Count the number of Certificates
     * const count = await prisma.certificate.count({
     *   where: {
     *     // ... the filter for the Certificates we want to count
     *   }
     * })
    **/
    count<T extends CertificateCountArgs>(args?: Prisma.Subset<T, CertificateCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], CertificateCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Certificate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends CertificateAggregateArgs>(args: Prisma.Subset<T, CertificateAggregateArgs>): Prisma.PrismaPromise<GetCertificateAggregateType<T>>;
    /**
     * Group by Certificate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CertificateGroupByArgs} args - Group by arguments.
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
    groupBy<T extends CertificateGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: CertificateGroupByArgs['orderBy'];
    } : {
        orderBy?: CertificateGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, CertificateGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCertificateGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Certificate model
     */
    readonly fields: CertificateFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Certificate.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__CertificateClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
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
 * Fields of the Certificate model
 */
export interface CertificateFieldRefs {
    readonly id: Prisma.FieldRef<"Certificate", 'String'>;
    readonly studentId: Prisma.FieldRef<"Certificate", 'String'>;
    readonly courseId: Prisma.FieldRef<"Certificate", 'String'>;
    readonly issuedAt: Prisma.FieldRef<"Certificate", 'DateTime'>;
    readonly certificateHash: Prisma.FieldRef<"Certificate", 'String'>;
    readonly status: Prisma.FieldRef<"Certificate", 'String'>;
}
/**
 * Certificate findUnique
 */
export type CertificateFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * Filter, which Certificate to fetch.
     */
    where: Prisma.CertificateWhereUniqueInput;
};
/**
 * Certificate findUniqueOrThrow
 */
export type CertificateFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * Filter, which Certificate to fetch.
     */
    where: Prisma.CertificateWhereUniqueInput;
};
/**
 * Certificate findFirst
 */
export type CertificateFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * Filter, which Certificate to fetch.
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Certificates to fetch.
     */
    orderBy?: Prisma.CertificateOrderByWithRelationInput | Prisma.CertificateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Certificates.
     */
    cursor?: Prisma.CertificateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Certificates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Certificates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Certificates.
     */
    distinct?: Prisma.CertificateScalarFieldEnum | Prisma.CertificateScalarFieldEnum[];
};
/**
 * Certificate findFirstOrThrow
 */
export type CertificateFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * Filter, which Certificate to fetch.
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Certificates to fetch.
     */
    orderBy?: Prisma.CertificateOrderByWithRelationInput | Prisma.CertificateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Certificates.
     */
    cursor?: Prisma.CertificateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Certificates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Certificates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Certificates.
     */
    distinct?: Prisma.CertificateScalarFieldEnum | Prisma.CertificateScalarFieldEnum[];
};
/**
 * Certificate findMany
 */
export type CertificateFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * Filter, which Certificates to fetch.
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Certificates to fetch.
     */
    orderBy?: Prisma.CertificateOrderByWithRelationInput | Prisma.CertificateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Certificates.
     */
    cursor?: Prisma.CertificateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Certificates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Certificates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Certificates.
     */
    distinct?: Prisma.CertificateScalarFieldEnum | Prisma.CertificateScalarFieldEnum[];
};
/**
 * Certificate create
 */
export type CertificateCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * The data needed to create a Certificate.
     */
    data: Prisma.XOR<Prisma.CertificateCreateInput, Prisma.CertificateUncheckedCreateInput>;
};
/**
 * Certificate createMany
 */
export type CertificateCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Certificates.
     */
    data: Prisma.CertificateCreateManyInput | Prisma.CertificateCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Certificate createManyAndReturn
 */
export type CertificateCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * The data used to create many Certificates.
     */
    data: Prisma.CertificateCreateManyInput | Prisma.CertificateCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Certificate update
 */
export type CertificateUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * The data needed to update a Certificate.
     */
    data: Prisma.XOR<Prisma.CertificateUpdateInput, Prisma.CertificateUncheckedUpdateInput>;
    /**
     * Choose, which Certificate to update.
     */
    where: Prisma.CertificateWhereUniqueInput;
};
/**
 * Certificate updateMany
 */
export type CertificateUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Certificates.
     */
    data: Prisma.XOR<Prisma.CertificateUpdateManyMutationInput, Prisma.CertificateUncheckedUpdateManyInput>;
    /**
     * Filter which Certificates to update
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * Limit how many Certificates to update.
     */
    limit?: number;
};
/**
 * Certificate updateManyAndReturn
 */
export type CertificateUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * The data used to update Certificates.
     */
    data: Prisma.XOR<Prisma.CertificateUpdateManyMutationInput, Prisma.CertificateUncheckedUpdateManyInput>;
    /**
     * Filter which Certificates to update
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * Limit how many Certificates to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Certificate upsert
 */
export type CertificateUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * The filter to search for the Certificate to update in case it exists.
     */
    where: Prisma.CertificateWhereUniqueInput;
    /**
     * In case the Certificate found by the `where` argument doesn't exist, create a new Certificate with this data.
     */
    create: Prisma.XOR<Prisma.CertificateCreateInput, Prisma.CertificateUncheckedCreateInput>;
    /**
     * In case the Certificate was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.CertificateUpdateInput, Prisma.CertificateUncheckedUpdateInput>;
};
/**
 * Certificate delete
 */
export type CertificateDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
    /**
     * Filter which Certificate to delete.
     */
    where: Prisma.CertificateWhereUniqueInput;
};
/**
 * Certificate deleteMany
 */
export type CertificateDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Certificates to delete
     */
    where?: Prisma.CertificateWhereInput;
    /**
     * Limit how many Certificates to delete.
     */
    limit?: number;
};
/**
 * Certificate without action
 */
export type CertificateDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Certificate
     */
    select?: Prisma.CertificateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Certificate
     */
    omit?: Prisma.CertificateOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.CertificateInclude<ExtArgs> | null;
};
export {};
//# sourceMappingURL=Certificate.d.ts.map