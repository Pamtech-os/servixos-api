import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { WebsiteConfigRepository } from 'src/modules/website/repositories/website-config.repository';
import { StorageService } from 'src/modules/storage/storage.service';
import {
  WebsiteGenerationService,
  type MyWebsiteData,
  type PublicWebsiteData,
} from 'src/modules/website/services/website-generation.service';
import { BookingFieldKey } from 'src/modules/website/schemas/website-config.schema';
import { type UpdateBookingFormDto } from 'src/modules/website/dto/update-booking-form.dto';
import { type UpdateDesignDto } from 'src/modules/website/dto/update-design.dto';
import { type UpdateContentDto } from 'src/modules/website/dto/update-content.dto';
import { WEBSITE_MESSAGES } from 'src/common/constants/messages/website.messages';
import { asMock } from 'test/helpers/mock';

const BUSINESS_ID = new Types.ObjectId();
const SUBDOMAIN = 'acme-plumbing';

const baseBusiness = {
  _id: BUSINESS_ID,
  name: 'Acme Plumbing',
  subdomain: SUBDOMAIN,
  categoryName: 'Plumbing',
  description: 'Expert plumbing services',
  phone: '+12025550100',
  email: 'hello@acme.com',
  address: '123 Main St',
  services: ['Leak repair', 'Installation'],
};

const baseConfig = {
  businessId: BUSINESS_ID,
  isPublished: true,
  colorPrimary: '#2563eb',
  colorSecondary: '#64748b',
  font: 'Inter',
  aiContent: {
    hero: {
      headline: 'We fix pipes',
      subheadline: 'Fast and reliable',
      ctaText: 'Book now',
    },
    about: { title: 'About us', body: 'Family business since 1990' },
    services: [{ name: 'Leak repair', description: 'Quick leak fixes' }],
    testimonialPlaceholder: { quote: 'Great service!', author: 'John D.' },
    contact: { callToAction: 'Get a free quote' },
  },
};

describe('WebsiteGenerationService.getMyWebsite', () => {
  let service: WebsiteGenerationService;
  let businessRepository: { findById: jest.Mock };
  let websiteConfigRepository: { findByBusinessId: jest.Mock };

  beforeEach(() => {
    businessRepository = { findById: jest.fn() };
    websiteConfigRepository = { findByBusinessId: jest.fn() };

    const configService = asMock<ConfigService>({
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ANTHROPIC_API_KEY: 'test-key',
          AI_WEBSITE_MODEL: 'claude-test',
          BASE_DOMAIN: 'servixos.com',
        };
        return values[key];
      }),
    });

    service = new WebsiteGenerationService(
      configService,
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<StorageService>({ uploadStream: jest.fn(), delete: jest.fn() }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns NotFoundException when business is not found', async () => {
    // Arrange
    businessRepository.findById.mockResolvedValue(null);
    websiteConfigRepository.findByBusinessId.mockResolvedValue(baseConfig);

    // Act
    const result = await service.getMyWebsite(BUSINESS_ID.toString());

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
    expect((result as NotFoundException).message).toBe(
      WEBSITE_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('returns NotFoundException when website config does not exist', async () => {
    // Arrange
    businessRepository.findById.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue(null);

    // Act
    const result = await service.getMyWebsite(BUSINESS_ID.toString());

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
    expect((result as NotFoundException).message).toBe(
      WEBSITE_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('returns full website data including unpublished state', async () => {
    // Arrange
    businessRepository.findById.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue({
      ...baseConfig,
      isPublished: false,
    });

    // Act
    const result = await service.getMyWebsite(BUSINESS_ID.toString());

    // Assert
    const expected: MyWebsiteData = {
      isPublished: false,
      subdomain: SUBDOMAIN,
      colorPrimary: baseConfig.colorPrimary,
      colorSecondary: baseConfig.colorSecondary,
      font: baseConfig.font,
      aiContent: baseConfig.aiContent,
      bookingForm: undefined,
    };
    expect(result).toEqual(expected);
  });

  it('falls back to businessId as subdomain when business has none', async () => {
    // Arrange
    const businessWithoutSubdomain = { ...baseBusiness, subdomain: undefined };
    businessRepository.findById.mockResolvedValue(businessWithoutSubdomain);
    websiteConfigRepository.findByBusinessId.mockResolvedValue(baseConfig);

    // Act
    const result = (await service.getMyWebsite(
      BUSINESS_ID.toString(),
    )) as MyWebsiteData;

    // Assert
    expect(result.subdomain).toBe(BUSINESS_ID.toString());
  });

  it('includes bookingForm when the config has one', async () => {
    // Arrange
    const bookingForm = {
      title: 'Book a Service',
      description: 'Fill in the form.',
      fields: [
        {
          key: BookingFieldKey.CLIENT_NAME,
          label: 'Full Name',
          placeholder: 'John Doe',
          required: true,
        },
      ],
    };
    businessRepository.findById.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue({
      ...baseConfig,
      bookingForm,
    });

    // Act
    const result = (await service.getMyWebsite(
      BUSINESS_ID.toString(),
    )) as MyWebsiteData;

    // Assert
    expect(result.bookingForm).toEqual(bookingForm);
  });
});

describe('WebsiteGenerationService.getPublicWebsite', () => {
  let service: WebsiteGenerationService;
  let businessRepository: { findBySubdomain: jest.Mock };
  let websiteConfigRepository: { findByBusinessId: jest.Mock };

  beforeEach(() => {
    businessRepository = { findBySubdomain: jest.fn() };
    websiteConfigRepository = { findByBusinessId: jest.fn() };

    const configService = asMock<ConfigService>({
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ANTHROPIC_API_KEY: 'test-key',
          AI_WEBSITE_MODEL: 'claude-test',
          BASE_DOMAIN: 'servixos.com',
        };
        return values[key];
      }),
    });

    service = new WebsiteGenerationService(
      configService,
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<StorageService>({ uploadStream: jest.fn(), delete: jest.fn() }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns NotFoundException when no business matches the subdomain', async () => {
    // Arrange
    businessRepository.findBySubdomain.mockResolvedValue(null);

    // Act
    const result = await service.getPublicWebsite(SUBDOMAIN);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
    expect((result as NotFoundException).message).toBe(
      WEBSITE_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('returns NotFoundException when website config does not exist', async () => {
    // Arrange
    businessRepository.findBySubdomain.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue(null);

    // Act
    const result = await service.getPublicWebsite(SUBDOMAIN);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
    expect((result as NotFoundException).message).toBe(
      WEBSITE_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('returns NotFoundException when website config exists but is not published', async () => {
    // Arrange
    businessRepository.findBySubdomain.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue({
      ...baseConfig,
      isPublished: false,
    });

    // Act
    const result = await service.getPublicWebsite(SUBDOMAIN);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
    expect((result as NotFoundException).message).toBe(
      WEBSITE_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('returns shaped public data for a published website', async () => {
    // Arrange
    businessRepository.findBySubdomain.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue(baseConfig);

    // Act
    const result = await service.getPublicWebsite(SUBDOMAIN);

    // Assert
    const expected: PublicWebsiteData = {
      business: {
        name: baseBusiness.name,
        categoryName: baseBusiness.categoryName,
        description: baseBusiness.description,
        phone: baseBusiness.phone,
        email: baseBusiness.email,
        address: baseBusiness.address,
        services: baseBusiness.services,
      },
      website: {
        colorPrimary: baseConfig.colorPrimary,
        colorSecondary: baseConfig.colorSecondary,
        font: baseConfig.font,
        aiContent: baseConfig.aiContent,
      },
    };
    expect(result).toEqual(expected);
  });

  it('looks up the config by the business _id, not the subdomain', async () => {
    // Arrange
    businessRepository.findBySubdomain.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue(baseConfig);

    // Act
    await service.getPublicWebsite(SUBDOMAIN);

    // Assert
    expect(websiteConfigRepository.findByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
    );
  });

  it('includes bookingForm in the response when the config has one', async () => {
    // Arrange
    const bookingForm = {
      title: 'Book a Service',
      description: 'We will get back to you within 24 hours.',
      fields: [
        {
          key: BookingFieldKey.CLIENT_NAME,
          label: 'Full Name',
          placeholder: 'John Doe',
          required: true,
        },
      ],
    };
    businessRepository.findBySubdomain.mockResolvedValue(baseBusiness);
    websiteConfigRepository.findByBusinessId.mockResolvedValue({
      ...baseConfig,
      bookingForm,
    });

    // Act
    const result = (await service.getPublicWebsite(
      SUBDOMAIN,
    )) as PublicWebsiteData;

    // Assert
    expect(result.website.bookingForm).toEqual(bookingForm);
  });
});

describe('WebsiteGenerationService.updateBookingForm', () => {
  let service: WebsiteGenerationService;
  let websiteConfigRepository: {
    findByBusinessId: jest.Mock;
    updateByBusinessId: jest.Mock;
  };

  const dto: UpdateBookingFormDto = {
    title: 'Book a Service',
    description: 'Fill out the form below.',
    fields: [
      {
        key: BookingFieldKey.CLIENT_NAME,
        label: 'Full Name',
        placeholder: 'John Doe',
        required: true,
      },
      {
        key: BookingFieldKey.SERVICE,
        label: 'Service Required',
        placeholder: 'Select a service',
        required: true,
      },
      {
        key: BookingFieldKey.REQUESTED_DATE,
        label: 'Start Date',
        placeholder: 'Select start date',
        required: true,
      },
    ],
  };

  beforeEach(() => {
    websiteConfigRepository = {
      findByBusinessId: jest.fn(),
      updateByBusinessId: jest.fn().mockResolvedValue(null),
    };

    const configService = asMock<ConfigService>({
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ANTHROPIC_API_KEY: 'test-key',
          AI_WEBSITE_MODEL: 'claude-test',
          BASE_DOMAIN: 'servixos.com',
        };
        return values[key];
      }),
    });

    service = new WebsiteGenerationService(
      configService,
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessRepository>({ findBySubdomain: jest.fn() }),
      asMock<StorageService>({ uploadStream: jest.fn(), delete: jest.fn() }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns NotFoundException when no website config exists for the business', async () => {
    // Arrange
    websiteConfigRepository.findByBusinessId.mockResolvedValue(null);

    // Act
    const result = await service.updateBookingForm(BUSINESS_ID.toString(), dto);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
    expect((result as NotFoundException).message).toBe(
      WEBSITE_MESSAGES.ERROR.NOT_FOUND,
    );
  });

  it('persists the booking form dto when the config exists', async () => {
    // Arrange
    websiteConfigRepository.findByBusinessId.mockResolvedValue({
      businessId: BUSINESS_ID,
    });

    // Act
    const result = await service.updateBookingForm(BUSINESS_ID.toString(), dto);

    // Assert
    expect(result).toBeUndefined();
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      { bookingForm: dto },
    );
  });
});

describe('WebsiteGenerationService.updateDesign', () => {
  let service: WebsiteGenerationService;
  let websiteConfigRepository: {
    findByBusinessId: jest.Mock;
    updateByBusinessId: jest.Mock;
  };
  let businessRepository: { updateById: jest.Mock };

  function makeService() {
    const configService = asMock<ConfigService>({
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ANTHROPIC_API_KEY: 'test-key',
          AI_WEBSITE_MODEL: 'claude-test',
          BASE_DOMAIN: 'servixos.com',
        };
        return values[key];
      }),
    });
    return new WebsiteGenerationService(
      configService,
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<StorageService>({ uploadStream: jest.fn(), delete: jest.fn() }),
    );
  }

  beforeEach(() => {
    websiteConfigRepository = {
      findByBusinessId: jest.fn().mockResolvedValue(baseConfig),
      updateByBusinessId: jest.fn().mockResolvedValue(null),
    };
    businessRepository = { updateById: jest.fn().mockResolvedValue(undefined) };
    service = makeService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns NotFoundException when no config exists', async () => {
    // Arrange
    websiteConfigRepository.findByBusinessId.mockResolvedValue(null);
    const dto: UpdateDesignDto = { colorPrimary: '#ff0000' };

    // Act
    const result = await service.updateDesign(BUSINESS_ID.toString(), dto);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('updates website config and business record with all design fields', async () => {
    // Arrange
    const dto: UpdateDesignDto = {
      colorPrimary: '#ff0000',
      colorSecondary: '#00ff00',
      font: 'Roboto',
    };
    websiteConfigRepository.updateByBusinessId.mockResolvedValue({
      colorPrimary: '#ff0000',
      colorSecondary: '#00ff00',
      font: 'Roboto',
    });

    // Act
    const result = await service.updateDesign(BUSINESS_ID.toString(), dto);

    // Assert
    expect(result).toEqual({
      colorPrimary: '#ff0000',
      colorSecondary: '#00ff00',
      font: 'Roboto',
    });
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      { colorPrimary: '#ff0000', colorSecondary: '#00ff00', font: 'Roboto' },
    );
    expect(businessRepository.updateById).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      {
        'colors.primary': '#ff0000',
        'colors.secondary': '#00ff00',
        font: 'Roboto',
      },
    );
  });

  it('updates only the provided design fields and skips undefined ones', async () => {
    // Arrange
    const dto: UpdateDesignDto = { colorPrimary: '#abc123' };

    // Act
    await service.updateDesign(BUSINESS_ID.toString(), dto);

    // Assert
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      { colorPrimary: '#abc123' },
    );
    expect(businessRepository.updateById).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      { 'colors.primary': '#abc123' },
    );
  });

  it('skips business update when dto is empty', async () => {
    // Arrange
    const dto: UpdateDesignDto = {};

    // Act
    await service.updateDesign(BUSINESS_ID.toString(), dto);

    // Assert
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      {},
    );
    expect(businessRepository.updateById).not.toHaveBeenCalled();
  });
});

describe('WebsiteGenerationService.updateContent', () => {
  let service: WebsiteGenerationService;
  let websiteConfigRepository: {
    findByBusinessId: jest.Mock;
    updateByBusinessId: jest.Mock;
  };

  function makeService() {
    const configService = asMock<ConfigService>({
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ANTHROPIC_API_KEY: 'test-key',
          AI_WEBSITE_MODEL: 'claude-test',
          BASE_DOMAIN: 'servixos.com',
        };
        return values[key];
      }),
    });
    return new WebsiteGenerationService(
      configService,
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessRepository>({ findBySubdomain: jest.fn() }),
      asMock<StorageService>({ uploadStream: jest.fn(), delete: jest.fn() }),
    );
  }

  beforeEach(() => {
    websiteConfigRepository = {
      findByBusinessId: jest.fn().mockResolvedValue(baseConfig),
      updateByBusinessId: jest.fn().mockResolvedValue(null),
    };
    service = makeService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns NotFoundException when no config exists', async () => {
    // Arrange
    websiteConfigRepository.findByBusinessId.mockResolvedValue(null);
    const dto: UpdateContentDto = { hero: { headline: 'New headline' } };

    // Act
    const result = await service.updateContent(BUSINESS_ID.toString(), dto);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('builds a flat dot-notation update from provided sections only', async () => {
    // Arrange
    const dto: UpdateContentDto = {
      hero: { headline: 'New headline', subheadline: 'Sub', ctaText: 'Go' },
      about: { title: 'About', body: 'Body text' },
    };

    // Act
    const result = await service.updateContent(BUSINESS_ID.toString(), dto);

    // Assert
    expect(result).toBeUndefined();
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      {
        'aiContent.hero': dto.hero,
        'aiContent.about': dto.about,
      },
    );
  });

  it('does not include omitted sections in the update', async () => {
    // Arrange
    const dto: UpdateContentDto = {
      contact: { callToAction: 'Call us today' },
    };

    // Act
    await service.updateContent(BUSINESS_ID.toString(), dto);

    // Assert
    const calls = websiteConfigRepository.updateByBusinessId.mock.calls as [
      string,
      Record<string, unknown>,
    ][];
    const call = calls[0][1];
    expect(Object.keys(call)).toEqual(['aiContent.contact']);
    expect(call['aiContent.contact']).toEqual(dto.contact);
  });

  it('persists a full services array replacement', async () => {
    // Arrange
    const dto: UpdateContentDto = {
      services: [
        { name: 'Leak repair', description: 'Fast fix' },
        { name: 'Installation', description: 'Professional install' },
      ],
    };

    // Act
    await service.updateContent(BUSINESS_ID.toString(), dto);

    // Assert
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      { 'aiContent.services': dto.services },
    );
  });
});

describe('WebsiteGenerationService.updateLogo', () => {
  let service: WebsiteGenerationService;
  let websiteConfigRepository: {
    findByBusinessId: jest.Mock;
    updateByBusinessId: jest.Mock;
  };
  let storageService: { uploadStream: jest.Mock; delete: jest.Mock };

  const makeFile = (mimetype = 'image/jpeg'): Express.Multer.File =>
    ({
      mimetype,
      originalname: 'logo.jpg',
      buffer: Buffer.from('fake'),
      size: 1024,
    }) as Express.Multer.File;

  beforeEach(() => {
    websiteConfigRepository = {
      findByBusinessId: jest.fn().mockResolvedValue(baseConfig),
      updateByBusinessId: jest.fn().mockResolvedValue(null),
    };
    storageService = {
      uploadStream: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/logo.jpg',
        publicId: 'logos/abc',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const configService = asMock<ConfigService>({
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ANTHROPIC_API_KEY: 'test-key',
          AI_WEBSITE_MODEL: 'claude-test',
          BASE_DOMAIN: 'servixos.com',
        };
        return values[key];
      }),
    });

    service = new WebsiteGenerationService(
      configService,
      asMock<WebsiteConfigRepository>(websiteConfigRepository),
      asMock<BusinessRepository>({ findById: jest.fn() }),
      asMock<StorageService>(storageService),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns BadRequestException when no file is provided', async () => {
    // Arrange — no file

    // Act
    const result = await service.updateLogo(BUSINESS_ID.toString(), undefined);

    // Assert
    const { BadRequestException } = await import('@nestjs/common');
    expect(result).toBeInstanceOf(BadRequestException);
  });

  it('returns BadRequestException when file MIME type is not allowed', async () => {
    // Arrange
    const file = makeFile('image/gif');

    // Act
    const result = await service.updateLogo(BUSINESS_ID.toString(), file);

    // Assert
    const { BadRequestException } = await import('@nestjs/common');
    expect(result).toBeInstanceOf(BadRequestException);
  });

  it('returns NotFoundException when no website config exists', async () => {
    // Arrange
    websiteConfigRepository.findByBusinessId.mockResolvedValue(null);
    const file = makeFile();

    // Act
    const result = await service.updateLogo(BUSINESS_ID.toString(), file);

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('uploads file, saves logoUrl and logoPublicId, returns logoUrl', async () => {
    // Arrange
    const file = makeFile('image/png');

    // Act
    const result = await service.updateLogo(BUSINESS_ID.toString(), file);

    // Assert
    expect(storageService.uploadStream).toHaveBeenCalledWith(
      file,
      `servixos/logos/${BUSINESS_ID.toString()}`,
    );
    expect(websiteConfigRepository.updateByBusinessId).toHaveBeenCalledWith(
      BUSINESS_ID.toString(),
      {
        logoUrl: 'https://cdn.example.com/logo.jpg',
        logoPublicId: 'logos/abc',
      },
    );
    expect(result).toEqual({ logoUrl: 'https://cdn.example.com/logo.jpg' });
  });

  it('deletes the previous logo from storage when one exists', async () => {
    // Arrange
    websiteConfigRepository.findByBusinessId.mockResolvedValue({
      ...baseConfig,
      logoPublicId: 'logos/old-logo',
    });
    const file = makeFile();

    // Act
    await service.updateLogo(BUSINESS_ID.toString(), file);

    // Assert — allow micro-task queue to flush the fire-and-forget delete
    await Promise.resolve();
    expect(storageService.delete).toHaveBeenCalledWith('logos/old-logo');
  });

  it('does not call delete when the config has no previous logo', async () => {
    // Arrange — baseConfig has no logoPublicId
    const file = makeFile();

    // Act
    await service.updateLogo(BUSINESS_ID.toString(), file);

    // Assert
    expect(storageService.delete).not.toHaveBeenCalled();
  });
});
