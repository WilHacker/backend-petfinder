import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { MapService } from './map.service';

const PERSONA_ID = 'persona-uuid';

const mockCoOwner = {
  persona_id: 'copropietario-uuid',
  nombre: 'Ana',
  apellido_paterno: 'García',
  foto_perfil_url: null,
  lat: -17.39,
  lng: -66.15,
};

const mockLostPet = {
  reporte_id: 10,
  mascota_id: 'mascota-perdida-uuid',
  nombre: 'Max',
  tipo_nombre: 'Perro',
  foto_principal_url: 'https://cdn.example.com/max.jpg',
  lat: -17.4,
  lng: -66.16,
};

const mockZonaCirculo = {
  zona_id: 1,
  nombre_zona: 'Casa',
  radio_metros: 200,
  centro_lat: -17.78,
  centro_lng: -63.18,
  geometria_json: null,
  mascotas: [
    {
      mascotaId: 'mascota-uuid',
      nombre: 'Rex',
      estado: 'en_casa',
      fotoUrl: 'https://cdn.example.com/rex.jpg',
      lat: -17.78,
      lng: -63.18,
    },
  ],
};

const mockZonaPoligono = {
  zona_id: 2,
  nombre_zona: 'Parque',
  radio_metros: null,
  centro_lat: null,
  centro_lng: null,
  geometria_json: JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [-66.14, -17.39],
        [-66.13, -17.39],
        [-66.13, -17.4],
        [-66.14, -17.39],
      ],
    ],
  }),
  mascotas: [
    {
      mascotaId: 'mascota-uuid',
      nombre: 'Rex',
      estado: 'en_paseo',
      fotoUrl: null,
      lat: null,
      lng: null,
    },
  ],
};

const mockPrisma = {
  $queryRaw: jest.fn(),
};

describe('MapService', () => {
  let service: MapService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MapService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<MapService>(MapService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── getSnapshot ───────────────────────

  describe('getSnapshot', () => {
    it('retorna estructura con marcadores y zonas vacías cuando no hay datos', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.marcadores.usuariosCompartidos).toHaveLength(0);
      expect(result.marcadores.desaparecidas).toHaveLength(0);
      expect(result.zonas).toHaveLength(0);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('mapea co-propietarios con nombre completo y coordenadas', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockCoOwner]) // co-owners
        .mockResolvedValueOnce([]) // lost pets
        .mockResolvedValueOnce([]); // zones

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.marcadores.usuariosCompartidos).toHaveLength(1);
      expect(result.marcadores.usuariosCompartidos[0]).toEqual({
        personaId: 'copropietario-uuid',
        nombre: 'Ana García',
        fotoUrl: null,
        lat: -17.39,
        lng: -66.15,
      });
    });

    it('mapea mascotas desaparecidas con tipo y coordenadas', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // co-owners
        .mockResolvedValueOnce([mockLostPet]) // lost pets
        .mockResolvedValueOnce([]); // zones

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.marcadores.desaparecidas).toHaveLength(1);
      expect(result.marcadores.desaparecidas[0]).toEqual({
        reporteId: 10,
        mascotaId: 'mascota-perdida-uuid',
        nombre: 'Max',
        tipo: 'Perro',
        fotoUrl: 'https://cdn.example.com/max.jpg',
        lat: -17.4,
        lng: -66.16,
      });
    });

    it('mapea zona de tipo círculo con centro, radioMetros y ubicación de mascota', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // co-owners
        .mockResolvedValueOnce([]) // lost pets
        .mockResolvedValueOnce([mockZonaCirculo]); // zones

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.zonas).toHaveLength(1);
      const zona = result.zonas[0];
      expect(zona.tipo).toBe('circulo');
      expect(zona.zonaId).toBe(1);
      expect(zona.nombre).toBe('Casa');
      if (zona.tipo === 'circulo') {
        expect(zona.centro).toEqual({ lat: -17.78, lng: -63.18 });
        expect(zona.radioMetros).toBe(200);
      }
    });

    it('incluye ubicación de mascota cuando tiene coordenadas', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockZonaCirculo]);

      const result = await service.getSnapshot(PERSONA_ID);

      const mascota = result.zonas[0].mascotas[0];
      expect(mascota.ubicacion).toEqual({ lat: -17.78, lng: -63.18 });
    });

    it('retorna ubicacion null cuando la mascota no tiene coordenadas', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockZonaPoligono]);

      const result = await service.getSnapshot(PERSONA_ID);

      const mascota = result.zonas[0].mascotas[0];
      expect(mascota.ubicacion).toBeNull();
    });

    it('mapea zona de tipo polígono con geometría GeoJSON', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockZonaPoligono]);

      const result = await service.getSnapshot(PERSONA_ID);

      const zona = result.zonas[0];
      expect(zona.tipo).toBe('poligono');
      if (zona.tipo === 'poligono') {
        expect(zona.geometria).toHaveProperty('type', 'Polygon');
        expect(zona.geometria).toHaveProperty('coordinates');
      }
    });

    it('acepta mascotas como string JSON (fallback de pg driver)', async () => {
      const zonaConMascotasString = {
        ...mockZonaCirculo,
        mascotas: JSON.stringify(mockZonaCirculo.mascotas),
      };
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([zonaConMascotasString]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.zonas[0].mascotas).toHaveLength(1);
      expect(result.zonas[0].mascotas[0].nombre).toBe('Rex');
    });

    it('ejecuta las 3 queries en paralelo (Promise.all)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getSnapshot(PERSONA_ID);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);
    });
  });

  // ─────────────────────── getPublicLostPets ───────────────────

  describe('getPublicLostPets', () => {
    const mockPublicRow = {
      reporte_id: 5,
      mascota_id: 'mascota-public-uuid',
      nombre: 'Luna',
      tipo_nombre: 'Gato',
      foto_principal_url: 'https://cdn.example.com/luna.jpg',
      lat: -17.5,
      lng: -66.2,
      fecha_perdida: new Date('2026-05-01T10:00:00Z'),
    };

    it('retorna lista de mascotas perdidas con todos los campos', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockPublicRow]);

      const result = await service.getPublicLostPets();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        reporteId: 5,
        mascotaId: 'mascota-public-uuid',
        nombre: 'Luna',
        tipo: 'Gato',
        fotoUrl: 'https://cdn.example.com/luna.jpg',
        lat: -17.5,
        lng: -66.2,
        fechaPerdida: mockPublicRow.fecha_perdida,
      });
    });

    it('retorna array vacío cuando no hay mascotas perdidas', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getPublicLostPets();

      expect(result).toHaveLength(0);
    });

    it('convierte reporte_id a número', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockPublicRow]);

      const result = await service.getPublicLostPets();

      expect(typeof result[0].reporteId).toBe('number');
    });
  });
});
