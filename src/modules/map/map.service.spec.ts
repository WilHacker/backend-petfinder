import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { MapService } from './map.service';

const PERSONA_ID = 'persona-uuid';

const mockMyPet = {
  mascota_id: 'mascota-uuid',
  nombre: 'Rex',
  estado: 'en_casa',
  tipo_nombre: 'Perro',
  foto_url: 'https://cdn.example.com/rex.jpg',
  lat: -17.78,
  lng: -63.18,
  recompensa: null,
};

const mockMyPetExtraviada = {
  mascota_id: 'mascota-extraviada-uuid',
  nombre: 'Luna',
  estado: 'extraviada',
  tipo_nombre: 'Gato',
  foto_url: null,
  lat: -17.79,
  lng: -63.19,
  recompensa: '500.00',
};

const mockMyPetSinGps = {
  mascota_id: 'mascota-sin-gps-uuid',
  nombre: 'Coco',
  estado: 'en_casa',
  tipo_nombre: 'Loro',
  foto_url: null,
  lat: null,
  lng: null,
  recompensa: null,
};

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
  fecha_perdida: new Date('2026-05-20T14:30:00Z'),
  recompensa: '200.00',
  alerta_comunidad_activa: false,
  alerta_comunidad_expira_el: null,
};

const mockLostPetSinRecompensa = {
  ...mockLostPet,
  reporte_id: 11,
  recompensa: null,
};

const mockZonaCirculo = {
  zona_id: 1,
  nombre_zona: 'Casa',
  esta_activa: true,
  radio_metros: 200,
  centro_lat: -17.78,
  centro_lng: -63.18,
  geometria_json: null,
  mascota_ids: ['mascota-uuid', 'mascota-sin-gps-uuid'],
};

const mockZonaPoligono = {
  zona_id: 2,
  nombre_zona: 'Parque',
  esta_activa: false,
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
  mascota_ids: ['mascota-uuid'],
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
    it('retorna estructura vacía cuando no hay datos', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.misMascotas).toHaveLength(0);
      expect(result.colaboradores).toHaveLength(0);
      expect(result.desaparecidas).toHaveLength(0);
      expect(result.zonas).toHaveLength(0);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('ejecuta las 4 queries en paralelo (Promise.all)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getSnapshot(PERSONA_ID);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(4);
    });

    // ── misMascotas ──

    it('mapea mascota propia con ubicación', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockMyPet])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.misMascotas).toHaveLength(1);
      expect(result.misMascotas[0]).toEqual({
        mascotaId: 'mascota-uuid',
        nombre: 'Rex',
        estado: 'en_casa',
        tipo: 'Perro',
        fotoUrl: 'https://cdn.example.com/rex.jpg',
        ubicacion: { lat: -17.78, lng: -63.18 },
      });
    });

    it('retorna ubicacion null cuando la mascota no tiene GPS', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockMyPetSinGps])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.misMascotas[0].ubicacion).toBeNull();
    });

    it('incluye recompensa cuando la mascota está extraviada y tiene valor', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockMyPetExtraviada])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.misMascotas[0]).toMatchObject({
        estado: 'extraviada',
        recompensa: 500,
      });
    });

    it('no incluye campo recompensa cuando la mascota no está extraviada', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([mockMyPet])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.misMascotas[0]).not.toHaveProperty('recompensa');
    });

    // ── colaboradores ──

    it('mapea colaboradores con nombre, apellidoPaterno y ubicación', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockCoOwner])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.colaboradores).toHaveLength(1);
      expect(result.colaboradores[0]).toEqual({
        personaId: 'copropietario-uuid',
        nombre: 'Ana',
        apellidoPaterno: 'García',
        fotoUrl: null,
        ubicacion: { lat: -17.39, lng: -66.15 },
      });
    });

    // ── desaparecidas ──

    it('mapea mascota desaparecida con recompensa, fechaPerdida y ubicacion como objeto', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockLostPet])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.desaparecidas).toHaveLength(1);
      expect(result.desaparecidas[0]).toEqual({
        reporteId: 10,
        mascotaId: 'mascota-perdida-uuid',
        nombre: 'Max',
        tipo: 'Perro',
        fotoUrl: 'https://cdn.example.com/max.jpg',
        ubicacion: { lat: -17.4, lng: -66.16 },
        fechaPerdida: mockLostPet.fecha_perdida,
        recompensa: 200,
        alertaComunidad: { activa: false, expiraEl: null },
      });
    });

    it('retorna recompensa null cuando no hay recompensa en el reporte', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockLostPetSinRecompensa])
        .mockResolvedValueOnce([]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.desaparecidas[0].recompensa).toBeNull();
    });

    // ── zonas ──

    it('mapea zona círculo con estado activa, centro, radioMetros y mascotaIds', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockZonaCirculo]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.zonas).toHaveLength(1);
      const zona = result.zonas[0];
      expect(zona.tipo).toBe('circulo');
      expect(zona.zonaId).toBe(1);
      expect(zona.nombre).toBe('Casa');
      expect(zona.estado).toBe('activa');
      expect(zona.mascotaIds).toEqual(['mascota-uuid', 'mascota-sin-gps-uuid']);
      if (zona.tipo === 'circulo') {
        expect(zona.centro).toEqual({ lat: -17.78, lng: -63.18 });
        expect(zona.radioMetros).toBe(200);
      }
    });

    it('mapea zona polígono con estado inactiva y geometría GeoJSON', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockZonaPoligono]);

      const result = await service.getSnapshot(PERSONA_ID);

      const zona = result.zonas[0];
      expect(zona.tipo).toBe('poligono');
      expect(zona.estado).toBe('inactiva');
      if (zona.tipo === 'poligono') {
        expect(zona.geometria).toHaveProperty('type', 'Polygon');
      }
    });

    it('acepta mascota_ids como string JSON (fallback de pg driver)', async () => {
      const zonaConIdsString = {
        ...mockZonaCirculo,
        mascota_ids: JSON.stringify(mockZonaCirculo.mascota_ids),
      };
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([zonaConIdsString]);

      const result = await service.getSnapshot(PERSONA_ID);

      expect(result.zonas[0].mascotaIds).toEqual(['mascota-uuid', 'mascota-sin-gps-uuid']);
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
      recompensa: '150.00',
      alerta_comunidad_activa: false,
      alerta_comunidad_expira_el: null,
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
        ubicacion: { lat: -17.5, lng: -66.2 },
        fechaPerdida: mockPublicRow.fecha_perdida,
        recompensa: 150,
        alertaComunidad: { activa: false, expiraEl: null },
      });
    });

    it('retorna recompensa null cuando no hay recompensa', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ ...mockPublicRow, recompensa: null }]);

      const result = await service.getPublicLostPets();

      expect(result[0].recompensa).toBeNull();
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
