import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { CertificateSearchService } from '../../search/CertificateSearchService.js';
import { CourseSearchService } from '../../search/CourseSearchService.js';
import { FilterParser } from '../../search/FilterParser.js';
import { SearchOptions } from '../../search/SearchService.js';
import { StudentSearchService } from '../../search/StudentSearchService.js';
import logger from '../../utils/logger.js';

export class SearchController {
  private prisma: PrismaClient;
  private courseSearchService: CourseSearchService;
  private studentSearchService: StudentSearchService;
  private certificateSearchService: CertificateSearchService;
  private filterParser: FilterParser;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.courseSearchService = new CourseSearchService(prisma);
    this.studentSearchService = new StudentSearchService(prisma);
    this.certificateSearchService = new CertificateSearchService(prisma);
    this.filterParser = new FilterParser();
  }

  private parseSearchOptions(req: Request): SearchOptions {
    const { query, page, limit, cursor, sort } = req.query;

    // Parse filters from query string
    const filters = this.filterParser.parseQueryStringFilters(req.url.split('?')[1] || '');

    return {
      query: query as string,
      filters,
      sort: sort as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      cursor: cursor as string,
    };
  }

  async searchCourses(req: Request, res: Response) {
    try {
      const options = this.parseSearchOptions(req);
      const result = await this.courseSearchService.search(options);

      res.json(result);
    } catch (error) {
      logger.error('Course search error:', error);
      res.status(400).json({
        error: 'Invalid search parameters',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async searchStudents(req: Request, res: Response) {
    try {
      const options = this.parseSearchOptions(req);
      const result = await this.studentSearchService.search(options);

      res.json(result);
    } catch (error) {
      logger.error('Student search error:', error);
      res.status(400).json({
        error: 'Invalid search parameters',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async searchCertificates(req: Request, res: Response) {
    try {
      const options = this.parseSearchOptions(req);
      const result = await this.certificateSearchService.search(options);

      res.json(result);
    } catch (error) {
      logger.error('Certificate search error:', error);
      res.status(400).json({
        error: 'Invalid search parameters',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async searchAll(req: Request, res: Response) {
    try {
      const options = this.parseSearchOptions(req);

      // Execute all searches in parallel
      const [courses, students, certificates] = await Promise.all([
        this.courseSearchService.search({ ...options, limit: 5 }), // Limit results for global search
        this.studentSearchService.search({ ...options, limit: 5 }),
        this.certificateSearchService.search({ ...options, limit: 5 }),
      ]);

      res.json({
        courses: courses.data,
        students: students.data,
        certificates: certificates.data,
        metadata: {
          query: options.query,
          filters: options.filters,
          totalResults:
            courses.metadata.totalResults +
            students.metadata.totalResults +
            certificates.metadata.totalResults,
        },
      });
    } catch (error) {
      logger.error('Global search error:', error);
      res.status(400).json({
        error: 'Invalid search parameters',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
