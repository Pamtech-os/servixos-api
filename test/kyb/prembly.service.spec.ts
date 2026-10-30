import { ConfigService } from '@nestjs/config';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import { PremblyService } from 'src/modules/kyb/services/prembly.service';
import { asMock } from 'test/helpers/mock';

const CONFIG: Record<string, string> = {
  PREMBLY_BASE_URL: 'https://prembly.test',
  PREMBLY_APP_ID: 'app-id',
  PREMBLY_API_KEY: 'api-key',
};

function makeService(config: Record<string, string> = CONFIG): PremblyService {
  return new PremblyService(
    asMock<ConfigService>({ get: jest.fn((key: string) => config[key]) }),
  );
}

function mockFetch(status: number, body: unknown): jest.SpyInstance {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function sentRequest(spy: jest.SpyInstance): { url: string; body: unknown } {
  const [url, init] = spy.mock.calls[0] as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

describe('PremblyService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports not configured when credentials are missing', () => {
    // Arrange
    const service = makeService({});

    // Act
    const configured = service.isConfigured;

    // Assert
    expect(configured).toBe(false);
  });

  it('calls the CAC endpoint with the type prefix split out for Nigeria', async () => {
    // Arrange
    const spy = mockFetch(200, { status: true, response_code: '00', data: {} });

    // Act
    await makeService().lookupCompany(SupportedCountry.NG, 'BN-998877', 'u1');

    // Assert
    expect(sentRequest(spy)).toEqual({
      url: 'https://prembly.test/api/v1/biometrics/merchant/data/verification/cac',
      body: { company_type: 'BN', rc_number: '998877' },
    });
  });

  it('defaults the CAC company type to RC when no prefix is given', async () => {
    // Arrange
    const spy = mockFetch(200, { status: true, response_code: '00', data: {} });

    // Act
    await makeService().lookupCompany(SupportedCountry.NG, '123456', 'u1');

    // Assert
    expect(sentRequest(spy).body).toEqual({
      company_type: 'RC',
      rc_number: '123456',
    });
  });

  it('calls the global company endpoint with the country code outside Nigeria', async () => {
    // Arrange
    const spy = mockFetch(200, { status: true, response_code: '00', data: {} });

    // Act
    await makeService().lookupCompany(SupportedCountry.GB, '01234567', 'u1');

    // Assert
    expect(sentRequest(spy)).toEqual({
      url: 'https://prembly.test/api/v1/biometrics/merchant/data/verification/global/company',
      body: {
        country_code: 'GB',
        company_number: '01234567',
        customer_reference: 'u1',
        customer_name: 'ServixOS',
      },
    });
  });

  it('returns found with the registered name on a successful match', async () => {
    // Arrange
    mockFetch(200, {
      status: true,
      response_code: '00',
      data: { company_name: ' Acme Ltd ' },
    });

    // Act
    const result = await makeService().lookupCompany(
      SupportedCountry.US,
      'C123',
      'u1',
    );

    // Assert
    expect(result).toEqual({ found: true, registeredName: 'Acme Ltd' });
  });

  it('returns not found when Prembly answers 404 with status false', async () => {
    // Arrange
    mockFetch(404, { status: false, response_code: '01', data: null });

    // Act
    const result = await makeService().lookupCompany(
      SupportedCountry.CA,
      'X1',
      'u1',
    );

    // Assert
    expect(result).toEqual({ found: false, registeredName: undefined });
  });

  it('throws when Prembly returns a server error', async () => {
    // Arrange
    mockFetch(503, { status: false });

    // Act
    const call = makeService().lookupCompany(SupportedCountry.NG, 'RC1', 'u1');

    // Assert
    await expect(call).rejects.toThrow('HTTP 503');
  });

  it('throws when Prembly rejects the credentials', async () => {
    // Arrange
    mockFetch(401, { status: false });

    // Act
    const call = makeService().lookupCompany(SupportedCountry.NG, 'RC1', 'u1');

    // Assert
    await expect(call).rejects.toThrow('rejected credentials');
  });
});
